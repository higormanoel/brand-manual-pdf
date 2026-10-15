import { test, expect, type Page } from "@playwright/test";
import type { NodeLocation, CommandBatch } from "../../src/core/commands";
async function mount(page: Page) {
  await page.goto("/?render-proof");
  await page.evaluate(async () => {
    const { mountReviewStudio } = await import(
      /* @vite-ignore */ "/tests/studio/reviewHarness.tsx" as string
    );
    mountReviewStudio();
  });
  await expect(page.getByRole("banner")).toContainText("Marquio");
}
async function select(page: Page, id: string) {
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  await page.getByRole("button", { name: `Camada ${id}`, exact: true }).click();
  await page.getByRole("button", { name: "Propriedades", exact: true }).click();
}
async function number(page: Page, label: string, value: number) {
  await page.getByLabel(label, { exact: true }).fill(String(value));
  await page.getByLabel(label, { exact: true }).press("Tab");
}
async function rect(page: Page, id: string) {
  const b = await page
    .locator(`.canvas-region .artboard [data-node-id="${id}"]`)
    .boundingBox();
  if (!b) throw new Error(`${id} missing`);
  return b;
}
test("numeric group resize changes rendered child dimensions and spacing, and undo restores both", async ({
  page,
}) => {
  await mount(page);
  await select(page, "group");
  const beforeA = await rect(page, "group-first"),
    beforeB = await rect(page, "group-second");
  await number(page, "Largura", 1200);
  await number(page, "Altura", 400);
  const afterA = await rect(page, "group-first"),
    afterB = await rect(page, "group-second");
  expect(afterA.width).toBeCloseTo(beforeA.width * 2);
  expect(afterA.height).toBeCloseTo(beforeA.height * 2);
  expect(afterB.x - afterA.x).toBeCloseTo((beforeB.x - beforeA.x) * 2);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  expect((await rect(page, "group-first")).width).toBeCloseTo(beforeA.width);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  expect((await rect(page, "group-first")).width).toBeCloseTo(afterA.width);
});
test("nested rotated northwest resize scales children while fixing the opposite corner", async ({
  page,
}) => {
  await mount(page);
  await select(page, "inner");
  const before = await rect(page, "nested-first");
  const opposite = page.getByRole("button", {
    name: "Redimensionar inner se",
    exact: true,
  });
  const a = await opposite.boundingBox();
  const handle = page.getByRole("button", {
    name: "Redimensionar inner nw",
    exact: true,
  });
  const h = await handle.boundingBox();
  if (!a || !h) throw new Error("handles missing");
  const delta = await page.evaluate(async () => {
    const { worldMatrix } = await import(
      /* @vite-ignore */ "/src/core/geometry.ts" as string
    );
    const { findNode } = await import(
      /* @vite-ignore */ "/src/core/commands.ts" as string
    );
    const p = window.reviewStudio.project;
    const l = findNode(p, p.pages[0].id, "inner") as NodeLocation;
    const m = worldMatrix([
      ...l.ancestors.map((n) => n.transform),
      l.node.transform,
    ]);
    return {
      x: (m[0] * -100 + m[2] * -50) * 0.5,
      y: (m[1] * -100 + m[3] * -50) * 0.5,
    };
  });
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    h.x + h.width / 2 + delta.x,
    h.y + h.height / 2 + delta.y,
  );
  await page.mouse.up();
  const after = await rect(page, "nested-first"),
    b = await opposite.boundingBox();
  expect(after.width).toBeCloseTo(before.width * 1.5, 0);
  expect(after.height).toBeCloseTo(before.height * 1.5, 0);
  expect(b!.x + b!.width / 2).toBeCloseTo(a.x + a.width / 2, 0);
  expect(b!.y + b!.height / 2).toBeCloseTo(a.y + a.height / 2, 0);
});
test("numeric and pointer mockup resizing keep projected artwork registered to its scene", async ({
  page,
}) => {
  await mount(page);
  await select(page, "planar");
  const measurements = () =>
    page.locator('.canvas-region [data-node-id="planar"]').evaluate((node) => {
      const scene = node.querySelector("img")!.getBoundingClientRect(),
        art = node.querySelector("[data-projection]")!.getBoundingClientRect();
      return {
        sceneWidth: scene.width,
        artWidth: art.width,
        relativeX: (art.x - scene.x) / scene.width,
      };
    });
  const before = await measurements();
  await number(page, "Largura", 1280);
  const after = await measurements();
  expect(after.artWidth).toBeCloseTo(before.artWidth * 2);
  expect(after.artWidth / after.sceneWidth).toBeCloseTo(
    before.artWidth / before.sceneWidth,
  );
  expect(after.relativeX).toBeCloseTo(before.relativeX);
  await page.getByLabel("Zoom", { exact: true }).selectOption("0.25");
  const handle = page.getByRole("button", {
    name: "Redimensionar planar se",
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const h = await handle.boundingBox();
  if (!h) throw new Error("missing handle");
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 40, h.y + h.height / 2 + 30);
  await page.mouse.up();
  const pointer = await measurements();
  expect(pointer.artWidth / pointer.sceneWidth).toBeCloseTo(
    before.artWidth / before.sceneWidth,
  );
  expect(pointer.relativeX).toBeCloseTo(before.relativeX);
});

test("reopens a planar application, edits perspective and acknowledged scene assets, removes masks, undo/redo", async ({
  page,
}, testInfo) => {
  await mount(page);
  await select(page, "planar");
  await expect(
    page.getByLabel("Cena da aplicação", { exact: true }),
  ).toBeVisible();
  await number(page, "Canto superior esquerdo X", 80);
  await page
    .getByRole("button", { name: "Aplicar perspectiva", exact: true })
    .click();
  expect(
    await page.evaluate(() => {
      const n = window.reviewStudio.project.pages[0].nodes.find(
        (n) => n.id === "planar",
      );
      return n?.type === "mockup" ? n.quad?.[0].x : undefined;
    }),
  ).toBe(80);
  await number(page, "Canto superior direito X", 0);
  await page
    .getByRole("button", { name: "Aplicar perspectiva", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("convexos");
  expect(
    await page.evaluate(() => {
      const n = window.reviewStudio.project.pages[0].nodes.find(
        (n) => n.id === "planar",
      );
      return n?.type === "mockup" ? n.quad?.[1].x : undefined;
    }),
  ).toBe(500);
  await number(page, "Canto superior direito X", 500);
  await page
    .getByRole("button", { name: "Aplicar perspectiva", exact: true })
    .click();
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.getByLabel("Importar arquivo", { exact: true }).setInputFiles({
    name: "nova-cena.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#d6cdb6"/></svg>',
    ),
  });
  await expect(
    page.getByRole("button", { name: "Inserir nova-cena.svg", exact: true }),
  ).toBeVisible();
  await select(page, "planar");
  await page
    .getByLabel("Cena da aplicação", { exact: true })
    .selectOption("uploaded-1");
  await page
    .getByLabel("Fundo da aplicação", { exact: true })
    .selectOption("scene-b");
  await page
    .getByLabel("Máscara da aplicação", { exact: true })
    .selectOption("");
  await page
    .getByLabel("Sobreposição da aplicação", { exact: true })
    .selectOption("");
  const data = await page.evaluate(() => ({
    node: window.reviewStudio.project.pages[0].nodes.find(
      (n) => n.id === "planar",
    ),
    assets: window.reviewStudio.project.assets.map((a) => a.id),
    batches: JSON.parse(
      JSON.stringify(window.reviewStudio.batches),
    ) as CommandBatch[],
  }));
  expect(data.node).toMatchObject({
    sceneAssetId: "uploaded-1",
    backgroundAssetId: "scene-b",
    approval: { status: "pending" },
  });
  expect(data.node).not.toHaveProperty("maskAssetId");
  expect(data.node).not.toHaveProperty("overlayAssetId");
  expect(data.assets).toContain("scene-a");
  expect(data.assets).toContain("uploaded-1");
  expect(
    data.batches
      .flatMap((b) => b.commands)
      .filter((c) => c.type === "asset.insert"),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await select(page, "planar");
  await expect(
    page.getByLabel("Sobreposição da aplicação", { exact: true }),
  ).toHaveValue("overlay-a");
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await select(page, "planar");
  await expect(
    page.getByLabel("Sobreposição da aplicação", { exact: true }),
  ).toHaveValue("");
  await page.screenshot({
    path: testInfo.outputPath("existing-mockup-properties.png"),
  });
});
test("replaces a finished application image through history while keeping crop, fit and original asset", async ({
  page,
}) => {
  await mount(page);
  await select(page, "finished");
  await expect(
    page.getByLabel("Imagem final da aplicação", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Imagem final da aplicação", { exact: true })
    .selectOption("art-b");
  expect(
    await page.evaluate(() => {
      const n = window.reviewStudio.project.pages[0].nodes.find(
        (n) => n.id === "finished",
      );
      return n?.type === "mockup"
        ? {
            parent: n.approval,
            child: n.children[0],
            assets: window.reviewStudio.project.assets.map((a) => a.id),
          }
        : null;
    }),
  ).toMatchObject({
    parent: { status: "pending" },
    child: {
      assetId: "art-b",
      origin: { assetId: "art-b" },
      fit: "contain",
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    },
    assets: expect.arrayContaining(["art-a", "art-b"]),
  });
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await select(page, "finished");
  await expect(
    page.getByLabel("Imagem final da aplicação", { exact: true }),
  ).toHaveValue("art-a");
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await select(page, "finished");
  await expect(
    page.getByLabel("Imagem final da aplicação", { exact: true }),
  ).toHaveValue("art-b");
});

test("hides descendant selection overlay when the parent is hidden", async ({
  page,
}) => {
  await mount(page);
  await select(page, "nested-first");
  await expect(page.locator('[data-selection-id="nested-first"]')).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  await page
    .getByRole("button", { name: "Ocultar outer", exact: true })
    .click();
  await expect(page.locator('[data-selection-id="nested-first"]')).toHaveCount(
    0,
  );
});

test("does not round untouched fractional perspective coordinates when applying a different coordinate", async ({
  page,
}) => {
  await page.goto("/?render-proof");
  await page.evaluate(async () => {
    const { mountReviewStudio } = await import(
      /* @vite-ignore */ "/tests/studio/reviewHarness.tsx" as string
    );
    mountReviewStudio({ fractionalQuad: true });
  });
  await select(page, "planar");
  await number(page, "Canto superior esquerdo X", 80);
  await page
    .getByRole("button", { name: "Aplicar perspectiva", exact: true })
    .click();
  expect(
    await page.evaluate(() => {
      const node = window.reviewStudio.project.pages[0].nodes.find(
        (n) => n.id === "planar",
      );
      return node?.type === "mockup" ? node.quad![0].y : undefined;
    }),
  ).toBe(100.123456789);
});
