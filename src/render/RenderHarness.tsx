import { useEffect, useState } from "react";
import type {
  AssetRecord,
  DocumentNode,
  Page,
  TextStyle,
} from "../core/project";
import { Artboard } from "./Artboard";
import { waitForArtboardReady } from "./textMeasurement";
import "./harness.css";
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
  origin: { kind: "fixture" as const },
  approval: { status: "approved" as const },
});
const textStyle: TextStyle = {
  fontFamily: "Inter",
  fontSize: 48,
  fontWeight: 400,
  fontStyle: "normal",
  lineHeight: 1.2,
  letterSpacing: 0,
  color: "#0f0f0f",
  align: "left",
  verticalAlign: "top",
};
const svg =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><path fill="#254A42" d="M0 0h600v400H0z"/><path fill="#DDF4AB" d="M0 0h300v200H0z"/><path fill="#E48A51" d="M300 200h300v200H300z"/><circle cx="300" cy="200" r="70" fill="white"/></svg>',
  );
const compositionAssets = {
  "proof-mask":
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><path fill="white" d="M0 0h200v100H0z"/></svg>',
    ),
  "proof-overlay":
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><path fill="#3159AD" d="M300 25h50v50h-50z"/></svg>',
    ),
};
const assets: AssetRecord[] = [
  ...Object.keys(compositionAssets).map((id) => ({
    id,
    name: id,
    mimeType: "image/svg+xml",
    path: `${id}.svg`,
    hash: "0".repeat(64),
    origin: { kind: "fixture" as const },
  })),
  {
    id: "proof-art",
    name: "Original geometry",
    mimeType: "image/svg+xml",
    path: "proof.svg",
    hash: "0".repeat(64),
    origin: { kind: "fixture" },
  },
  {
    id: "proof-scene",
    name: "Photographic laptop scene",
    mimeType: "image/png",
    path: "mockups/laptop.png",
    hash: "0".repeat(64),
    origin: { kind: "fixture" },
  },
];
const nodes: DocumentNode[] = [
  {
    ...base("title", 91, 64, 1200, 70),
    type: "text",
    text: "Searchable Aurora proof",
    style: textStyle,
  },
  {
    ...base("rotated", 200, 120, 360, 80),
    transform: {
      ...base("", 0, 0, 1, 1).transform,
      x: 200,
      y: 120,
      width: 360,
      height: 80,
      rotation: 90,
    },
    type: "text",
    text: "Rotated live text",
    style: { ...textStyle, fontSize: 32 },
  },
  {
    ...base("group", 320, 200, 400, 240),
    type: "group",
    opacity: 0.6,
    children: [
      {
        ...base("ellipse", 0, 0, 240, 180),
        type: "shape",
        shape: "ellipse",
        style: {
          fill: "#DDF4AB",
          stroke: "#254A42",
          strokeWidth: 4,
          cornerRadius: 0,
        },
      },
      {
        ...base("group-text", 40, 70, 320, 90),
        type: "text",
        text: "Editable group",
        style: { ...textStyle, fontSize: 32 },
      },
    ],
  },
  {
    ...base("crop", 320, 540, 400, 260),
    type: "image",
    assetId: "proof-art",
    fit: "fill",
    crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  },
  {
    ...base("application", 850, 260, 800, 500),
    type: "mockup",
    template: "screen",
    sceneAssetId: "proof-scene",
    artworkAssetId: "proof-art",
    quad: [
      { x: 222.966507177, y: 66.418703507 },
      { x: 557.894736842, y: 52.603613177 },
      { x: 568.421052632, y: 280.021253985 },
      { x: 233.014354067, y: 300.212539851 },
    ],
    children: [],
  },
  {
    ...base("mask-overlay-proof", 950, 820, 400, 100),
    type: "mockup",
    template: "custom",
    artworkAssetId: "proof-art",
    maskAssetId: "proof-mask",
    overlayAssetId: "proof-overlay",
    children: [],
  },
  {
    ...base("footer", 91, 970, 1500, 40),
    type: "text",
    text: "Original photographic scene · Projective surface · Local Inter",
    style: { ...textStyle, fontSize: 21 },
  },
];
const proof: Page = {
  id: "proof-page",
  sectionId: "proof-section",
  title: "Renderer proof",
  width: 1920,
  height: 1080,
  background: "#ffffff",
  nodes,
};
/** Deliberately separate from the Studio shell. Stable proof route remains usable after integration. */
export function RenderHarness() {
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    waitForArtboardReady()
      .then(() => setReady(true))
      .catch((error) => setError(String(error)));
  }, []);
  return (
    <main data-render-ready={ready}>
      {error && <p role="alert">{error}</p>}
      <Artboard
        page={proof}
        assets={assets}
        resolveAsset={(asset) =>
          asset.id === "proof-art"
            ? svg
            : compositionAssets[asset.id as keyof typeof compositionAssets] ||
              `/${asset.path}`
        }
        mode="editor"
      />
    </main>
  );
}
