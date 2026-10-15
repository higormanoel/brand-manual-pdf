import {
  createProject,
  parseProject,
  type BrandProject,
} from "../core/project";
import { applyCommands, type SaveAck } from "../core/commands";
import type { AssetImportInput } from "../core/assets";
import { connectLocalProject, type LocalProjectClient } from "../server/client";
import {
  RecoveryStore,
  RecoveryPublicationError,
  type RecoveryRecord,
  type CanonicalPublication,
  type PublicationReceipt,
} from "../storage/recovery";
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
/** Canonical publication is atomic across tabs; cache health never negates a durable acknowledgment. */
export async function createBrowserRuntime(
  snapshot?: ProjectSnapshot,
  preserveRecovery = false,
): Promise<StudioRuntime> {
  let store: RecoveryStore | undefined;
  let cacheFailure: unknown;
  try {
    store = await RecoveryStore.open();
  } catch (error) {
    cacheFailure = error;
  }
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
  const serial = <T>(action: () => Promise<T>) => {
    const work = tail.then(action);
    tail = work.catch(() => {});
    return work;
  };
  function copyConfirmed(record: RecoveryRecord) {
    project = parseProject(record.project);
    for (const [name, owned] of Object.entries(record.assets))
      Object.defineProperty(bytes, name, {
        value: new Uint8Array(owned),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    revisions.set(project.revision, structuredClone(project));
  }
  function resolveAsset(asset: BrandProject["assets"][number]) {
    if (closed) return "";
    const identity = JSON.stringify([
      asset.id,
      asset.path,
      asset.hash,
      asset.mimeType,
    ]);
    let url = urls.get(identity);
    if (!url && bytes[asset.path]) {
      url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes[asset.path]).buffer], {
          type: asset.mimeType,
        }),
      );
      urls.set(identity, url);
    }
    return url ?? "";
  }
  const confirmedInput = (next: BrandProject) => ({
    project: next,
    assets: bytes,
    pending: [],
    confirmedRevision: next.revision,
    mode: "browser-only" as const,
  });
  async function refreshCache() {
    try {
      if (!store) throw cacheFailure ?? new Error("Recuperação indisponível");
      await store.save(confirmedInput(project));
      remember(project.id);
    } catch (error) {
      cacheFailure = error;
    }
  }
  const initial = await createSnapshot(project, bytes);
  try {
    const existing = preserveRecovery
      ? await canonical.publication(project.id)
      : undefined;
    const publication =
      existing ??
      (await canonical.publish(confirmedInput(initial.project), null));
    await createSnapshot(publication.record.project, publication.record.assets);
    copyConfirmed(publication.record);
    if (!preserveRecovery) await refreshCache();
  } catch (error) {
    store?.close();
    canonical.close();
    throw error;
  }
  async function finish(publication: CanonicalPublication): Promise<SaveAck> {
    if (!publication.ack) throw new Error("Recibo de publicação ausente");
    copyConfirmed(publication.record);
    revisions.set(
      publication.ack.revision,
      structuredClone(publication.ack.project),
    );
    await refreshCache();
    return structuredClone(publication.ack);
  }
  async function inspect(receipt: PublicationReceipt) {
    const publication = await canonical.publication(project.id, receipt);
    if (!publication)
      throw new RecoveryPublicationError(
        "revision-conflict",
        "Projeto confirmado indisponível.",
        0,
      );
    if (
      !publication.ack &&
      publication.record.project.revision !== receipt.expectedRevision
    )
      throw new RecoveryPublicationError(
        "revision-conflict",
        "Outra sessão confirmou alterações. Recarregue ou baixe sua recuperação.",
        publication.record.project.revision,
      );
    return publication;
  }
  return {
    mode: "browser-only",
    project: structuredClone(project),
    resolveAsset,
    commit(batch) {
      const captured = structuredClone(batch);
      return serial(async () => {
        const fingerprint = await hash(
          new TextEncoder().encode(
            JSON.stringify({
              type: "commit",
              expectedRevision: captured.expectedRevision,
              commands: captured.commands,
            }),
          ),
        );
        const receipt = {
          commandId: captured.commandId,
          expectedRevision: captured.expectedRevision,
          fingerprint,
        };
        const observed = await inspect(receipt);
        if (observed.ack) return finish(observed);
        for (const [name, value] of Object.entries(observed.record.assets))
          Object.defineProperty(bytes, name, {
            value: new Uint8Array(value),
            enumerable: true,
            writable: true,
            configurable: true,
          });
        const next = {
          ...applyCommands(observed.record.project, captured.commands),
          revision: captured.expectedRevision + 1,
        };
        const validated = await createSnapshot(next, bytes);
        return finish(
          await canonical.publish(
            confirmedInput(validated.project),
            captured.expectedRevision,
            receipt,
          ),
        );
      });
    },
    importAsset(input, batch) {
      const captured = {
        ...input,
        origin: structuredClone(input.origin),
        bytes: new Uint8Array(input.bytes),
      };
      const metadata = { ...batch };
      return serial(async () => {
        const digest = await hash(captured.bytes);
        const fingerprint = await hash(
          new TextEncoder().encode(
            JSON.stringify({
              type: "asset",
              expectedRevision: metadata.expectedRevision,
              name: captured.name,
              mimeType: captured.mimeType,
              origin: captured.origin,
              hash: digest,
            }),
          ),
        );
        const receipt = { ...metadata, fingerprint };
        const observed = await inspect(receipt);
        let ack: SaveAck;
        if (observed.ack) ack = await finish(observed);
        else {
          for (const [name, value] of Object.entries(observed.record.assets))
            Object.defineProperty(bytes, name, {
              value: new Uint8Array(value),
              enumerable: true,
              writable: true,
              configurable: true,
            });
          const asset = {
            id: crypto.randomUUID(),
            path: `assets/${digest}`,
            hash: digest,
            name: captured.name,
            mimeType: captured.mimeType,
            origin: captured.origin,
          };
          bytes[asset.path] = captured.bytes;
          const next = {
            ...applyCommands(observed.record.project, [
              { type: "asset.insert", asset },
            ]),
            revision: metadata.expectedRevision + 1,
          };
          const validated = await createSnapshot(next, bytes);
          ack = await finish(
            await canonical.publish(
              confirmedInput(validated.project),
              metadata.expectedRevision,
              receipt,
            ),
          );
        }
        const asset = ack.project.assets.at(-1);
        if (
          !asset ||
          asset.hash !== digest ||
          asset.name !== captured.name ||
          asset.mimeType !== captured.mimeType
        )
          throw new Error("Recibo de importação inválido");
        return { asset, ack };
      });
    },
    async reload() {
      const publication = await canonical.publication(project.id);
      if (!publication) throw new Error("Projeto confirmado indisponível");
      await createSnapshot(
        publication.record.project,
        publication.record.assets,
      );
      copyConfirmed(publication.record);
      return structuredClone(project);
    },
    async exportPortable(revision) {
      const previous = revisions.get(revision);
      if (!previous) throw new Error("Revisão do navegador indisponível.");
      return exportPortable(await createSnapshot(previous, bytes));
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
        try {
          if (!store)
            throw cacheFailure ?? new Error("Recuperação indisponível");
          await store.save({ ...capture, assets: bytes, mode: "browser-only" });
          remember(capture.project.id);
        } catch (error) {
          cacheFailure = error;
          throw error;
        }
        const previousFailure = cacheFailure;
        cacheFailure = undefined;
        if (previousFailure) throw previousFailure;
      });
    },
    close() {
      closed = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
      void tail.finally(() => {
        store?.close();
        canonical.close();
      });
    },
  };
}
export async function resumeBrowserRuntime(): Promise<Startup> {
  let store: RecoveryStore | undefined;
  try {
    store = await RecoveryStore.open();
  } catch {
    /* Canonical storage and checkpoint health remain independent. */
  }
  const canonical = await RecoveryStore.open({
    name: "marquio-browser-confirmed-v1",
  });
  try {
    let id = await canonical.lastProjectId();
    if (!id) {
      try {
        id = localStorage.getItem(LAST) ?? undefined;
      } catch {}
    }
    const record = id ? await store?.load(id) : undefined;
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
    store?.close();
    canonical.close();
  }
}
export async function createLocalRuntime(
  client: LocalProjectClient,
): Promise<Startup> {
  let project = await client.getProject();
  const snap = await client.snapshot(project.revision);
  const bytes = ownBytes(snap.assets);
  // Keep the first confirmed snapshot for each media identity for this session.
  // History may still render an older record after the same asset ID changes.
  const assetRevisions = new Map<string, number>();
  const assetIdentity = (asset: BrandProject["assets"][number]) =>
    JSON.stringify([asset.id, asset.path, asset.hash, asset.mimeType]);
  function rememberAssets(confirmed: BrandProject) {
    for (const asset of confirmed.assets) {
      const identity = assetIdentity(asset);
      if (!assetRevisions.has(identity)) assetRevisions.set(identity, confirmed.revision);
    }
  }
  rememberAssets(project);
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
    resolveAsset(asset) {
      const revision = assetRevisions.get(assetIdentity(asset));
      return revision === undefined ? "" : client.assetUrl(asset.id, revision);
    },
    async commit(batch) {
      const ack = await client.commit(batch);
      project = ack.project;
      rememberAssets(project);
      return ack;
    },
    async importAsset(input: AssetImportInput, batch) {
      const copy = new Uint8Array(input.bytes);
      const result = await client.importAsset({ ...input, bytes: copy }, batch);
      bytes[result.asset.path] = copy;
      project = result.ack.project;
      rememberAssets(project);
      return result;
    },
    async reload() {
      project = await client.getProject();
      const snapshot = await client.snapshot(project.revision);
      rememberAssets(snapshot.project);
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
