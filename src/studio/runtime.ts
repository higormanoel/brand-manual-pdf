import {
  createProject,
  parseProject,
  type BrandProject,
} from "../core/project";
import { applyCommands, type SaveAck } from "../core/commands";
import type { AssetImportInput } from "../core/assets";
import { connectLocalProject, type LocalProjectClient } from "../server/client";
import { RecoveryStore, type RecoveryRecord } from "../storage/recovery";
import { createSnapshot, type ProjectSnapshot } from "../storage/snapshot";
import { exportPortable } from "../storage/portable";
import type { StudioRuntime } from "./runtime-contract";
const LAST = "marquio:last-browser-project:v1";
export interface Startup {
  runtime: StudioRuntime;
  recovery?: RecoveryRecord;
}
const ownBytes = (bytes: Readonly<Record<string, Uint8Array>>) =>
  Object.fromEntries(
    Object.entries(bytes).map(([p, b]) => [p, new Uint8Array(b)]),
  );
function backup(project: BrandProject, bytes: Record<string, Uint8Array>) {
  const copy = parseProject(project);
  copy.title = `${copy.title} — recuperação não confirmada`;
  return createSnapshot(copy, bytes).then(exportPortable);
}
function remember(id: string) {
  localStorage.setItem(LAST, id);
}
async function hash(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
/** Browser-only commits become durable before acknowledgment; all asset bytes live outside history. */
export async function createBrowserRuntime(
  snapshot?: ProjectSnapshot,
  preserveRecovery = false,
): Promise<StudioRuntime> {
  const store = await RecoveryStore.open();
  const canonical = await RecoveryStore.open({
    name: "marquio-browser-confirmed-v1",
  });
  let project = snapshot
    ? parseProject(snapshot.project)
    : createProject("Novo projeto");
  const bytes = ownBytes(snapshot?.assets ?? {});
  const urls = new Map<string, string>();
  const revisions = new Map<number, BrandProject>();
  let closed = false;
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const p = tail.then(action);
    tail = p.catch(() => {});
    return p;
  };
  function resolver(asset: BrandProject["assets"][number]) {
    if (closed) return "";
    let u = urls.get(asset.id);
    if (!u && bytes[asset.path]) {
      u = URL.createObjectURL(
        new Blob([new Uint8Array(bytes[asset.path]).buffer], {
          type: asset.mimeType,
        }),
      );
      urls.set(asset.id, u);
    }
    return u ?? "";
  }
  async function persist(
    next: BrandProject,
    pending: RecoveryRecord["pending"] = [],
  ) {
    const record = {
      project: next,
      assets: bytes,
      pending,
      confirmedRevision: next.revision,
      mode: "browser-only" as const,
    };
    await canonical.save(record);
    await store.save(record);
    remember(next.id);
  }
  const initial = await createSnapshot(project, bytes);
  if (!preserveRecovery) await persist(initial.project);
  revisions.set(project.revision, initial.project);
  async function acknowledge(
    next: BrandProject,
    commandId: string,
  ): Promise<SaveAck> {
    const validated = await createSnapshot(next, bytes);
    await persist(validated.project);
    project = parseProject(validated.project);
    revisions.set(next.revision, validated.project);
    return {
      commandId,
      revision: next.revision,
      project: structuredClone(next),
    };
  }
  return {
    mode: "browser-only",
    project: structuredClone(project),
    resolveAsset: resolver,
    commit(batch) {
      const captured = structuredClone(batch);
      return serial(async () => {
        if (captured.expectedRevision !== project.revision)
          throw new Error(
            "Conflito de revisão no navegador. Reabra ou baixe a recuperação.",
          );
        return acknowledge(
          {
            ...applyCommands(project, captured.commands),
            revision: project.revision + 1,
          },
          captured.commandId,
        );
      });
    },
    importAsset(input, batch) {
      const copied = {
        ...input,
        origin: structuredClone(input.origin),
        bytes: new Uint8Array(input.bytes),
      };
      const metadata = { ...batch };
      return serial(async () => {
        if (metadata.expectedRevision !== project.revision)
          throw new Error("Conflito de revisão no navegador.");
        const digest = await hash(copied.bytes);
        const asset = {
          id: crypto.randomUUID(),
          path: `assets/${digest}`,
          hash: digest,
          name: copied.name,
          mimeType: copied.mimeType,
          origin: copied.origin,
        };
        bytes[asset.path] = copied.bytes;
        const ack = await acknowledge(
          {
            ...applyCommands(project, [{ type: "asset.insert", asset }]),
            revision: project.revision + 1,
          },
          metadata.commandId,
        );
        return { asset, ack };
      });
    },
    async reload() {
      return structuredClone(project);
    },
    async exportPortable(revision) {
      const snap = revisions.get(revision);
      if (!snap) throw new Error("Revisão do navegador indisponível.");
      return exportPortable(await createSnapshot(snap, bytes));
    },
    exportRecovery(visible) {
      return backup(visible, bytes);
    },
    checkpoint(input) {
      const capture = structuredClone(input);
      capture.project.revision = Math.max(
        capture.project.revision,
        capture.confirmedRevision,
      );
      return serial(async () => {
        await store.save({ ...capture, assets: bytes, mode: "browser-only" });
        remember(capture.project.id);
      });
    },
    close() {
      closed = true;
      urls.forEach(URL.revokeObjectURL);
      urls.clear();
      void tail.finally(() => {
        store.close();
        canonical.close();
      });
    },
  };
}
export async function resumeBrowserRuntime(): Promise<Startup> {
  const store = await RecoveryStore.open();
  const canonical = await RecoveryStore.open({
    name: "marquio-browser-confirmed-v1",
  });
  try {
    const id = localStorage.getItem(LAST);
    const record = id ? await store.load(id) : undefined;
    const confirmed = id ? await canonical.load(id) : undefined;
    if (record || confirmed) {
      const base = confirmed ?? record!;
      const runtime = await createBrowserRuntime(
        await createSnapshot(base.project, base.assets),
        true,
      );
      return { runtime, recovery: record?.pending.length ? record : undefined };
    }
    return { runtime: await createBrowserRuntime() };
  } finally {
    store.close();
    canonical.close();
  }
}
export async function createLocalRuntime(
  client: LocalProjectClient,
): Promise<Startup> {
  let project = await client.getProject();
  const snap = await client.snapshot(project.revision);
  const bytes = ownBytes(snap.assets);
  let store: RecoveryStore | undefined;
  let recoveryFailure: unknown;
  try {
    store = await RecoveryStore.open();
  } catch (error) {
    recoveryFailure = error;
  }
  const recovery = await store?.load(project.id);
  let tail: Promise<unknown> = Promise.resolve();
  const runtime: StudioRuntime = {
    mode: "local",
    project: structuredClone(project),
    resolveAsset: (asset) => client.assetUrl(asset.id),
    async commit(batch) {
      const ack = await client.commit(batch);
      project = ack.project;
      return ack;
    },
    async importAsset(input: AssetImportInput, batch) {
      const copy = new Uint8Array(input.bytes);
      const result = await client.importAsset({ ...input, bytes: copy }, batch);
      bytes[result.asset.path] = copy;
      project = result.ack.project;
      return result;
    },
    async reload() {
      project = await client.getProject();
      const snapshot = await client.snapshot(project.revision);
      for (const [name, value] of Object.entries(snapshot.assets))
        Object.defineProperty(bytes, name, {
          value: new Uint8Array(value),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      return project;
    },
    exportPortable(revision) {
      return client.portable(revision);
    },
    exportRecovery(visible) {
      return backup(visible, bytes);
    },
    async exportPdf(revision) {
      const response = await fetch(`/api/pdf?revision=${revision}`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: response.statusText }));
        throw new Error(error.message);
      }
      const actual = Number(response.headers.get("X-Marquio-Revision")),
        pages = Number(response.headers.get("X-Marquio-Pages"));
      if (actual !== revision || !Number.isInteger(pages) || pages < 1)
        throw new Error("Metadados de exportação inválidos.");
      return { blob: await response.blob(), revision: actual, pages };
    },
    checkpoint(input) {
      const capture = structuredClone(input);
      capture.project.revision = Math.max(
        capture.project.revision,
        capture.confirmedRevision,
      );
      const task = tail.then(() => {
        if (!store)
          throw recoveryFailure ?? new Error("Recuperação indisponível");
        return store.save({ ...capture, assets: bytes, mode: "local" });
      });
      tail = task.catch(() => {});
      return task.then(() => {});
    },
    close() {
      void tail.finally(() => store?.close());
    },
  };
  return {
    runtime,
    recovery: recovery?.status === "pending" ? recovery : undefined,
  };
}
/** A failed local session stays an error. Only a non-API web host starts browser-only mode. */
export async function initializeRuntime(): Promise<Startup> {
  if (new URLSearchParams(location.search).get("mode") === "browser")
    return resumeBrowserRuntime();
  if (new URLSearchParams(location.hash.slice(1)).has("session"))
    return createLocalRuntime(await connectLocalProject());
  const response = await fetch("/api/project", { credentials: "same-origin" });
  if (
    response.status === 404 ||
    (response.ok &&
      !response.headers.get("content-type")?.includes("application/json"))
  )
    return resumeBrowserRuntime();
  return createLocalRuntime(await connectLocalProject());
}
