import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  createProject,
  parseProject,
  type DocumentNode,
} from "../../src/core/project";
import { createSnapshot } from "../../src/storage/snapshot";
export async function exportFixture() {
  const project = createProject("PDF proof");
  const font = new Uint8Array(
    await fs.readFile(
      "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
    ),
  );
  const image = new TextEncoder().encode(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="200" height="200" fill="#c17042"/><rect x="200" width="200" height="200" fill="#283e36"/></svg>',
  );
  const bytes: Record<string, Uint8Array> = {};
  for (const [id, name, mime, content] of [
    ["font-proof", "proof.woff2", "font/woff2", font],
    ["image-proof", "proof.svg", "image/svg+xml", image],
  ] as const) {
    const hash = createHash("sha256").update(content).digest("hex");
    const path = `assets/${hash}`;
    project.assets.push({
      id,
      name,
      mimeType: mime,
      path,
      hash,
      origin: { kind: "provided" },
    });
    bytes[path] = content;
  }
  project.brand.typography = [
    {
      id: "uploaded-font",
      family: "Uploaded Proof",
      assetId: "font-proof",
      role: "body",
      weights: [400],
      fallback: "sans-serif",
      origin: { kind: "provided" },
      approval: { status: "approved" },
    },
  ];
  const base = {
    opacity: 1,
    visible: true,
    locked: false,
    origin: { kind: "manual" as const },
    approval: { status: "approved" as const },
    transform: {
      x: 100,
      y: 100,
      width: 800,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
  };
  const text: DocumentNode = {
    ...base,
    id: "text-proof",
    name: "Searchable uploaded font",
    type: "text",
    text: "SEARCHABLE AURORA uploaded original",
    style: {
      fontFamily: '"Uploaded Proof"',
      fontSize: 36,
      fontWeight: 400,
      fontStyle: "normal",
      lineHeight: 1.2,
      letterSpacing: 0,
      color: "#0f0f0f",
      align: "left",
      verticalAlign: "top",
    },
  };
  const photo: DocumentNode = {
    ...base,
    id: "crop-proof",
    name: "Crop rotated transparency",
    type: "image",
    assetId: "image-proof",
    fit: "cover",
    crop: { x: 0.25, y: 0, width: 0.5, height: 1 },
    opacity: 0.55,
    transform: {
      ...base.transform,
      x: 450,
      y: 350,
      width: 600,
      height: 300,
      rotation: 12,
    },
  };
  project.pages = [
    {
      id: "page-first",
      sectionId: project.sections[0].id,
      title: "First",
      width: 1920,
      height: 1080,
      background: "#ffffff",
      nodes: [text, photo],
    },
    {
      id: "page-second",
      sectionId: project.sections[0].id,
      title: "Second",
      width: 1200,
      height: 800,
      background: "#eeeeee",
      nodes: [
        {
          ...text,
          id: "second-text",
          text: "SECOND PAGE immutable revision zero",
        },
      ],
    },
  ];
  return createSnapshot(parseProject(project), bytes);
}
