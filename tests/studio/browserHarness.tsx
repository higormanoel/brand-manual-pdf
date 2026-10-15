import { createRoot } from "react-dom/client";
import { App } from "../../src/studio/App";
import { createProject, type BrandProject } from "../../src/core/project";
import { applyCommands, type CommandBatch } from "../../src/core/commands";
import type { StudioRuntime } from "../../src/studio/runtime-contract";
declare global {
  interface Window {
    studioTest: {
      stored: BrandProject;
      batches: CommandBatch[];
      fail: boolean;
      checkpointFails: boolean;
      exported: number[];
    };
  }
}
export function mountStudioTest() {
  const project = createProject("Projeto de prova");
  project.pages = [
    {
      id: "test-page",
      sectionId: project.sections[0].id,
      title: "Página editável",
      width: 1920,
      height: 1080,
      background: "#ffffff",
      nodes: [],
    },
  ];
  const state = (window.studioTest = {
    stored: project,
    batches: [] as CommandBatch[],
    fail: false,
    checkpointFails: false,
    exported: [] as number[],
  });
  const runtime: StudioRuntime = {
    mode: "local",
    project,
    resolveAsset: () => "",
    async commit(batch) {
      state.batches.push(structuredClone(batch));
      if (state.fail) throw new Error("Conflito de revisão externo");
      if (batch.expectedRevision !== state.stored.revision)
        throw new Error("Revisão esperada incorreta");
      state.stored = {
        ...applyCommands(state.stored, batch.commands),
        revision: state.stored.revision + 1,
      };
      return {
        commandId: batch.commandId,
        revision: state.stored.revision,
        project: structuredClone(state.stored),
      };
    },
    async importAsset() {
      throw new Error("Importação fora desta prova");
    },
    async exportPortable(revision) {
      state.exported.push(revision);
      return new Uint8Array();
    },
    async reload() {
      return structuredClone(state.stored);
    },
    async checkpoint() {
      if (state.checkpointFails)
        throw new Error("Cota de recuperação esgotada");
    },
  };
  document.getElementById("root")!.style.display = "none";
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(<App runtime={runtime} />);
}
