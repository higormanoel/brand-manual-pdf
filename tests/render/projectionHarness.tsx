import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { Artboard } from "../../src/render/Artboard";
import { waitForArtboardReady } from "../../src/render/textMeasurement";
import type { AssetRecord, DocumentNode, Page } from "../../src/core/project";

const colors = ["#ce392c", "#3159ad", "#e48a51", "#ddf4ab"];
function artwork(width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#283e36"/>${[
    [0, 0],
    [0.8, 0],
    [0.8, 0.8],
    [0, 0.8],
  ]
    .map(
      ([x, y], i) =>
        `<rect x="${x * width}" y="${y * height}" width="${width * 0.2}" height="${height * 0.2}" fill="${colors[i]}"/>`,
    )
    .join("")}</svg>`;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#283e36";
  ctx.fillRect(0, 0, width, height);
  [
    [0, 0],
    [0.8, 0],
    [0.8, 0.8],
    [0, 0.8],
  ].forEach(([x, y], i) => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(x * width, y * height, width * 0.2, height * 0.2);
  });
  return {
    svg: "data:image/svg+xml," + encodeURIComponent(svg),
    png: canvas.toDataURL("image/png"),
  };
}
export async function mountProjectionProof(mode: "client" | "ssr") {
  const urls: Record<string, string> = {};
  const assets: AssetRecord[] = [],
    nodes: DocumentNode[] = [];
  const specs = [
    { id: "card", w: 300, h: 150, x: 100 },
    { id: "poster", w: 150, h: 225, x: 500 },
    { id: "screen", w: 280, h: 180, x: 800 },
  ];
  for (const spec of specs) {
    const sources = artwork(spec.w, spec.h);
    for (const [kind, src] of Object.entries(sources)) {
      const id = `${spec.id}-${kind}`,
        y = kind === "svg" ? 100 : 500;
      urls[id] = src;
      assets.push({
        id,
        name: id,
        mimeType: kind === "svg" ? "image/svg+xml" : "image/png",
        path: `${id}.${kind}`,
        hash: "0".repeat(64),
        origin: { kind: "fixture" },
      });
      nodes.push({
        id,
        name: id,
        type: "mockup",
        template: "custom",
        artworkAssetId: id,
        quad: [
          { x: 0, y: 0 },
          { x: spec.w, y: 0 },
          { x: spec.w, y: spec.h },
          { x: 0, y: spec.h },
        ],
        children: [],
        transform: {
          x: spec.x,
          y,
          width: spec.w,
          height: spec.h,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        visible: true,
        locked: false,
        opacity: 1,
        origin: { kind: "fixture" },
        approval: { status: "approved" },
      });
    }
  }
  for (const [id, path, mimeType] of [
    ["real-poster", "demo-artwork/aurora-poster.svg", "image/svg+xml"],
    ["photo", "mockups/framed-poster.png", "image/png"],
  ])
    assets.push({
      id,
      name: id,
      mimeType,
      path,
      hash: "0".repeat(64),
      origin: { kind: "fixture" },
    });
  const sx = 500 / 1672,
    sy = 281 / 941;
  nodes.push({
    id: "real-poster",
    name: "Actual full-surface poster",
    type: "mockup",
    template: "poster",
    sceneAssetId: "photo",
    artworkAssetId: "real-poster",
    quad: [
      { x: 588 * sx, y: 64 * sy },
      { x: 1088 * sx, y: 54 * sy },
      { x: 1088 * sx, y: 812 * sy },
      { x: 588 * sx, y: 795 * sy },
    ],
    children: [],
    transform: {
      x: 1200,
      y: 100,
      width: 500,
      height: 281,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    visible: true,
    locked: false,
    opacity: 1,
    origin: { kind: "fixture" },
    approval: { status: "approved" },
  });
  const page: Page = {
    id: "projection-proof",
    sectionId: "proof",
    title: "Rectangular source projection",
    width: 1920,
    height: 1080,
    background: "#ffffff",
    nodes,
  };
  const tree = (
    <Artboard
      page={page}
      assets={assets}
      resolveAsset={(asset) => urls[asset.id] || `/${asset.path}`}
      mode="print"
    />
  );
  document.getElementById("root")!.style.display = "none";
  const container = document.createElement("main");
  document.body.append(container);
  if (mode === "ssr") container.innerHTML = renderToStaticMarkup(tree);
  else flushSync(() => createRoot(container).render(tree));
  await waitForArtboardReady(container);
  return {
    sources: specs.flatMap((s) => [
      { id: s.id + "-svg", x: s.x, y: 100, w: s.w, h: s.h },
      { id: s.id + "-png", x: s.x, y: 500, w: s.w, h: s.h },
    ]),
  };
}
