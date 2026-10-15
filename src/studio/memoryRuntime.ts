/// <reference types="vite/client" />
/** Integration stage only: Task9 replaces production bootstrap with the local
 * session / IndexedDB runtime. Bytes remain original; no durability claim. */
import fixture from "../../fixtures/aurora/project.json";
import { parseProject } from "../core/project";
import { applyCommands } from "../core/commands";
import { generateManual } from "../editorial/generate";
import { measureText } from "../render/textMeasurement";
import { loadProjectFonts } from "../render/fonts";
import { exportPortable } from "../storage/portable";
import type { StudioRuntime } from "./runtime-contract";
const fixtureSources = import.meta.glob("../../fixtures/aurora/assets/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
export async function createMemoryRuntime(): Promise<StudioRuntime> {
  let project = parseProject(fixture);
  const bytes: Record<string, Uint8Array> = {};
  const urls = new Map<string, string>();
  await Promise.all(
    project.assets.map(async (asset) => {
      const source = fixtureSources[`../../fixtures/aurora/${asset.path}`];
      if (typeof source !== "string")
        throw new Error(`Asset indisponível: ${asset.name}`);
      bytes[asset.path] = new TextEncoder().encode(source);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes[asset.path]).buffer], {
          type: asset.mimeType,
        }),
      );
      urls.set(asset.id, url);
    }),
  );
  const resolver = (asset: (typeof project.assets)[number]) =>
    urls.get(asset.id) ?? "";
  await loadProjectFonts(project, resolver);
  const proposal = await generateManual(project, {
    measureText,
    variantId: "aurora-demo",
  });
  project = { ...project, pages: proposal.sections.flatMap((s) => s.pages) };
  const initial = structuredClone(project);
  return {
    mode: "browser-only",
    project: initial,
    resolveAsset: resolver,
    async commit(batch) {
      if (batch.expectedRevision !== project.revision)
        throw new Error("Conflito de revisão.");
      project = {
        ...applyCommands(project, batch.commands),
        revision: project.revision + 1,
      };
      return {
        commandId: batch.commandId,
        revision: project.revision,
        project: structuredClone(project),
      };
    },
    async importAsset(input, batch) {
      if (batch.expectedRevision !== project.revision)
        throw new Error("Conflito de revisão.");
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new Uint8Array(input.bytes).buffer,
          ),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const asset = {
        id: crypto.randomUUID(),
        name: input.name,
        mimeType: input.mimeType,
        path: `assets/${hash}-${input.name.replace(/[^\w.-]/g, "_")}`,
        hash,
        origin: input.origin,
      };
      bytes[asset.path] = new Uint8Array(input.bytes);
      urls.set(
        asset.id,
        URL.createObjectURL(
          new Blob([new Uint8Array(input.bytes).buffer], {
            type: input.mimeType,
          }),
        ),
      );
      project = {
        ...applyCommands(project, [{ type: "asset.insert", asset }]),
        revision: project.revision + 1,
      };
      return {
        asset,
        ack: {
          commandId: batch.commandId,
          revision: project.revision,
          project: structuredClone(project),
        },
      };
    },
    async reload() {
      return structuredClone(project);
    },
    async exportPortable(revision) {
      if (project.revision !== revision)
        throw new Error("Revisão indisponível.");
      return exportPortable({
        revision,
        project: structuredClone(project),
        assets: bytes,
      });
    },
  };
}
