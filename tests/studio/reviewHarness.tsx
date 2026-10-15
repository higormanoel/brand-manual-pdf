import { createRoot } from "react-dom/client";
import { App } from "../../src/studio/App";
import {
  createProject,
  type BrandProject,
  type AssetRecord,
  type DocumentNode,
} from "../../src/core/project";
import { applyCommands, type CommandBatch } from "../../src/core/commands";
import type { StudioRuntime } from "../../src/studio/runtime-contract";
const base = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
) => ({
  id,
  name: id,
  transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
  opacity: 1,
  visible: true,
  locked: false,
  origin: { kind: "manual" as const },
  approval: { status: "approved" as const },
});
const shape = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): DocumentNode => ({
  ...base(id, x, y, width, height),
  type: "shape",
  shape: "rectangle",
  style: { fill: "#335d4b", stroke: "none", strokeWidth: 0, cornerRadius: 0 },
});
declare global {
  interface Window {
    reviewStudio: {
      project: BrandProject;
      batches: CommandBatch[];
      imports: number;
    };
  }
}
export function mountReviewStudio() {
  const project = createProject("Revisão do editor");
  project.assets = [
    "scene-a",
    "scene-b",
    "art-a",
    "art-b",
    "mask-a",
    "overlay-a",
  ].map((id) => ({
    id,
    name: id,
    mimeType: "image/svg+xml",
    path: `assets/${id}.svg`,
    hash: "0".repeat(64),
    origin: { kind: "manual" },
  }));
  project.pages = [
    {
      id: "review-page",
      sectionId: project.sections[0].id,
      title: "Prova de conteúdo",
      width: 1920,
      height: 1080,
      background: "#ffffff",
      nodes: [
        {
          ...base("group", 150, 150, 600, 200),
          type: "group",
          children: [
            shape("group-first", 0, 0, 100, 200),
            shape("group-second", 500, 0, 100, 200),
          ],
        },
        {
          ...base("outer", 200, 520, 500, 250),
          type: "group",
          transform: {
            ...base("", 200, 520, 500, 250).transform,
            rotation: 12,
            scaleX: 1.2,
            scaleY: 0.8,
          },
          children: [
            {
              ...base("inner", 50, 40, 200, 100),
              type: "group",
              transform: {
                ...base("", 50, 40, 200, 100).transform,
                rotation: 23,
              },
              children: [
                shape("nested-first", 0, 0, 80, 100),
                shape("nested-second", 120, 0, 80, 100),
              ],
            },
          ],
        },
        {
          ...base("planar", 1000, 180, 640, 420),
          type: "mockup",
          template: "custom",
          sceneAssetId: "scene-a",
          backgroundAssetId: "scene-a",
          artworkAssetId: "art-a",
          maskAssetId: "mask-a",
          overlayAssetId: "overlay-a",
          quad: [
            { x: 100, y: 100 },
            { x: 500, y: 100 },
            { x: 500, y: 300 },
            { x: 100, y: 300 },
          ],
          children: [],
        },
        {
          ...base("finished", 1000, 720, 320, 200),
          type: "mockup",
          template: "custom",
          children: [
            {
              ...base("final-image", 0, 0, 320, 200),
              type: "image",
              assetId: "art-a",
              fit: "contain",
              crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
            },
          ],
        },
      ],
    },
  ];
  const state = (window.reviewStudio = {
    project,
    batches: [] as CommandBatch[],
    imports: 0,
  });
  const sources = new Map(
    project.assets.map((a) => [
      a.id,
      "data:image/svg+xml," +
        encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="${a.id.includes("mask") ? "white" : a.id.includes("art") ? "#d5aa7c" : "#335d4b"}"/></svg>`,
        ),
    ]),
  );
  const runtime: StudioRuntime = {
    mode: "local",
    project,
    resolveAsset: (a) => sources.get(a.id) ?? "",
    async commit(batch) {
      if (batch.expectedRevision !== state.project.revision)
        throw new Error("Revisão incorreta");
      state.batches.push(structuredClone(batch));
      state.project = {
        ...applyCommands(state.project, batch.commands),
        revision: state.project.revision + 1,
      };
      return {
        commandId: batch.commandId,
        revision: state.project.revision,
        project: structuredClone(state.project),
      };
    },
    async importAsset(input, batch) {
      state.imports++;
      const asset: AssetRecord = {
        id: `uploaded-${state.imports}`,
        name: input.name,
        mimeType: input.mimeType,
        path: `assets/uploaded-${state.imports}.svg`,
        hash: "a".repeat(64),
        origin: input.origin,
      };
      sources.set(
        asset.id,
        URL.createObjectURL(
          new Blob([new Uint8Array(input.bytes).buffer], {
            type: input.mimeType,
          }),
        ),
      );
      state.project = {
        ...applyCommands(state.project, [{ type: "asset.insert", asset }]),
        revision: state.project.revision + 1,
      };
      return {
        asset,
        ack: {
          commandId: batch.commandId,
          revision: state.project.revision,
          project: structuredClone(state.project),
        },
      };
    },
    async exportPortable() {
      return new Uint8Array();
    },
  };
  document.getElementById("root")!.style.display = "none";
  const container = document.createElement("div");
  document.body.append(container);
  createRoot(container).render(<App runtime={runtime} />);
}
