import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Artboard } from "../render/Artboard";
import {
  measureText,
  waitForArtboardReady,
  type TextMeasureRequest,
} from "../render/textMeasurement";
import { loadProjectFonts } from "../render/fonts";
import { preflight } from "../render/preflight";
import {
  parseProject,
  type BrandProject,
  type DocumentNode,
} from "../core/project";
import { generateManual } from "../editorial/generate";
import type { ProjectSnapshot } from "../storage/snapshot";
type Wire = {
  project: BrandProject;
  assets: Record<string, string>;
};
const root = createRoot(document.getElementById("root")!);
let urls: string[] = [];
async function prepare(wire: Wire) {
  const project = parseProject(wire.project);
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const resolver = (asset: BrandProject["assets"][number]) => {
    const encoded = wire.assets[asset.path];
    if (encoded === undefined) throw new Error(`Asset ausente: ${asset.name}`);
    const u = URL.createObjectURL(
      new Blob([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], {
        type: asset.mimeType,
      }),
    );
    urls.push(u);
    return u;
  };
  const resolved = new Map(project.assets.map((a) => [a.id, resolver(a)]));
  const resolve = (a: BrandProject["assets"][number]) => resolved.get(a.id)!;
  const fonts = await loadProjectFonts(project, resolve);
  const missing = fonts.filter((f) => f.status !== "loaded");
  if (missing.length) throw new Error(missing.map((f) => f.message).join("\n"));
  return { project, resolve };
}
const api = {
  async render(wire: Wire) {
    const { project, resolve } = await prepare(wire);
    if (!project.pages.length)
      throw new Error(
        "O projeto não contém páginas. Gere ou adicione uma página antes de exportar.",
      );
    flushSync(() =>
      root.render(
        <>
          {project.pages.map((p) => (
            <Artboard
              key={p.id}
              page={p}
              assets={project.assets}
              resolveAsset={resolve}
              mode="print"
            />
          ))}
        </>,
      ),
    );
    await waitForArtboardReady();
    const measurements = new Map();
    async function walk(nodes: DocumentNode[]) {
      for (const n of nodes) {
        if (!n.visible) continue;
        if (n.type === "text")
          measurements.set(
            n.id,
            await measureText({
              text: n.text,
              style: n.style,
              width: n.transform.width,
              height: n.transform.height,
            }),
          );
        if (n.type === "group" || n.type === "mockup") await walk(n.children);
      }
    }
    for (const p of project.pages) await walk(p.nodes);
    const errors = preflight(project, measurements).filter(
      (d) => d.severity === "error",
    );
    if (errors.length) throw new Error(errors.map((d) => d.message).join("\n"));
    return {
      revision: project.revision,
      pages: project.pages.map((p) => ({ width: p.width, height: p.height })),
    };
  },
  async generate(wire: Wire, variantId: string) {
    const { project } = await prepare(wire);
    return generateManual(project, { variantId, measureText });
  },
  async measure(request: TextMeasureRequest) {
    return measureText(request);
  },
};
Object.assign(window, { marquioExport: api });
export type BrowserExportApi = typeof api;
export type { ProjectSnapshot };
