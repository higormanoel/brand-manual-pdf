import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parseProject, type ProjectionQuad } from "../core/project";
import { createSnapshot } from "../storage/snapshot";
import { generateWithBrowser } from "../export/pdf";
import { createSceneMockup } from "../mockups/scenes";
import manifest from "../mockups/scenes-data.json";
function sourceRoot() {
  const u = fileURLToPath(new URL("../../", import.meta.url));
  return u.endsWith("/dist/") ? path.resolve(u, "..") : u;
}
export async function demoSnapshot() {
  const root = sourceRoot();
  let project = parseProject(
    JSON.parse(
      await fs.readFile(
        path.join(root, "fixtures/aurora/project.json"),
        "utf8",
      ),
    ),
  );
  const assets: Record<string, Uint8Array> = {};
  for (const a of project.assets)
    assets[a.path] = new Uint8Array(
      await fs.readFile(path.join(root, "fixtures/aurora", a.path)),
    );
  const pairs = [
    ["card-stack", "aurora-card.svg"],
    ["framed-poster", "aurora-poster.svg"],
    ["laptop", "aurora-screen.svg"],
  ];
  for (let i = 0; i < manifest.length; i++) {
    const scene = manifest[i],
      pair = pairs[i];
    for (const [relative, mime, id] of [
      [`mockups/${scene.file}`, "image/png", `demo-scene-${i}`],
      [`demo-artwork/${pair[1]}`, "image/svg+xml", `demo-art-${i}`],
    ]) {
      const bytes = new Uint8Array(
        await fs.readFile(path.join(root, "public", relative)),
      );
      const hash = createHash("sha256").update(bytes).digest("hex");
      const asset = {
        id,
        name: path.basename(relative),
        path: `assets/${hash}`,
        mimeType: mime,
        hash,
        origin: {
          kind: "fixture" as const,
          description:
            "Cena fotográfica original gerada para Marquio; aplicação fictícia Aurora.",
        },
      };
      project.assets.push(asset);
      assets[asset.path] = bytes;
    }
  }
  const snapshot = await createSnapshot(project, assets);
  const generated = await generateWithBrowser(snapshot, "aurora-demo");
  project = { ...project, pages: generated.sections.flatMap((s) => s.pages) };
  const section = project.sections.find((s) => s.kind === "applications")!;
  const applicationPages: typeof project.pages = [];
  for (let i = 0; i < manifest.length; i++) {
    const scene = manifest[i];
    const presetId = ["card-stack", "framed-poster", "laptop"][i];
    const node = createSceneMockup({
      presetId,
      sceneAssetId: `demo-scene-${i}`,
      artworkAssetId: `demo-art-${i}`,
      sceneWidth: scene.width,
      sceneHeight: scene.height,
      corners: scene.surfaces[0].corners as ProjectionQuad,
      width: 1920,
      height: 1080,
    });
    node.origin = {
      kind: "fixture",
      description:
        "Cena fotográfica original gerada para Marquio; arte Aurora original, fictícia.",
    };
    node.approval = { status: "approved" };
    applicationPages.push({
      id: `demo-application-${i}`,
      sectionId: section.id,
      title: `Aplicação — ${scene.name}`,
      width: 1920,
      height: 1080,
      background: "#FFFFFF",
      nodes: [node],
    });
  }
  const lastApplication = project.pages.reduce(
    (last, page, index) => (page.sectionId === section.id ? index : last),
    -1,
  );
  const credits = project.sections.find((s) => s.kind === "credits");
  const firstCredit = project.pages.findIndex(
    (page) => page.sectionId === credits?.id,
  );
  project.pages.splice(
    lastApplication >= 0
      ? lastApplication + 1
      : firstCredit >= 0
        ? firstCredit
        : project.pages.length,
    0,
    ...applicationPages,
  );
  project.pages.forEach((page, index) => {
    for (const node of page.nodes)
      if (node.type === "text" && node.name === "page-number")
        node.text = String(index + 1).padStart(3, "0");
  });
  return createSnapshot(project, assets);
}
