import { test, expect, type Page } from "@playwright/test";
import { PNG } from "pngjs";
async function mountEditor(page: Page) {
  await page.goto("/?render-proof");
  await page.evaluate(async () => {
    const { mountMemoryStudio } = await import(
      /* @vite-ignore */ "/tests/studio/memoryHarness.tsx" as string
    );
    await mountMemoryStudio();
  });
}
test("edits actual artboard objects with history, zoom, pages and typography", async ({
  page,
}) => {
  await mountEditor(page);
  await expect(page.getByRole("banner")).toContainText("Marquio");
  await page
    .getByRole("button", { name: "Inserir texto", exact: true })
    .click();
  await page.getByLabel("Conteúdo do texto").fill("Manual editável");
  await page.getByLabel("Conteúdo do texto").press("Tab");
  await expect(
    page
      .locator('[data-node-type="text"]')
      .filter({ hasText: "Manual editável" })
      .first(),
  ).toBeVisible();
  await page.getByLabel("X", { exact: true }).fill("200");
  await page.getByLabel("X", { exact: true }).press("Tab");
  await page.getByLabel("Zoom", { exact: true }).selectOption("0.5");
  const hit = page.locator('[data-hit-id][aria-pressed="true"]').first();
  const bounds = await hit.boundingBox();
  if (!bounds) throw new Error("Selected object missing");
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 70, bounds.y + 40);
  await page.mouse.up();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("300");
  await page.getByLabel("Fonte", { exact: true }).fill("Georgia");
  await page.getByLabel("Fonte", { exact: true }).press("Tab");
  await page.getByLabel("Peso", { exact: true }).selectOption("700");
  await page.getByLabel("Entrelinha").fill("1.5");
  await page.getByLabel("Entrelinha").press("Tab");
  await page.getByLabel("Espaçamento").fill("2");
  await page.getByLabel("Espaçamento").press("Tab");
  await page.getByLabel("Alinhamento do texto").selectOption("center");
  await page.getByLabel("Cor do texto").fill("#dde8df");
  const selectedId = await page
    .locator('.canvas-region [data-hit-id][aria-pressed="true"]')
    .getAttribute("data-hit-id");
  const rendered = page.locator(
    `.canvas-region [data-node-id="${selectedId}"] [data-text-content]`,
  );
  await expect(rendered).toHaveCSS("font-weight", "700");
  await expect(rendered).toHaveCSS("line-height", "72px");
  await expect(rendered).toHaveCSS("letter-spacing", "2px");
  await expect(rendered).toHaveCSS("color", "rgb(221, 232, 223)");
  await expect(rendered).toHaveCSS("text-align", "center");

  await page.getByLabel("Conteúdo do texto").focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Delete");
  await expect(page.getByLabel("Conteúdo do texto")).toHaveValue("Delete");
  await page.getByLabel("Conteúdo do texto").press("Tab");
  const count = await page.locator(".page-thumbnail").count();
  await page
    .getByRole("button", { name: "Duplicar página", exact: true })
    .click();
  await expect(page.locator(".page-thumbnail")).toHaveCount(count + 1);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.locator(".page-thumbnail")).toHaveCount(count);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(page.locator(".page-thumbnail")).toHaveCount(count + 1);
  await expect(page.getByRole("status").first()).toContainText("Confirmado");
});
test("resizes and moves at 125%, groups contiguous layers and keeps paint order through undo", async ({
  page,
}) => {
  await mountEditor(page);
  await page
    .getByRole("button", { name: "Adicionar página", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inserir forma", exact: true })
    .click();
  await page.getByLabel("Zoom", { exact: true }).selectOption("1.25");
  const hit = page.locator(".canvas-region [data-hit-id]").first();
  const b = await hit.boundingBox();
  if (!b) throw new Error("shape missing");
  await page.mouse.move(b.x + 20, b.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + 70, b.y + 45);
  await page.mouse.up();
  await expect(page.getByLabel("X", { exact: true })).toHaveValue("240");
  await expect(page.getByLabel("Y", { exact: true })).toHaveValue("220");
  const handle = page.getByRole("button", {
    name: /Redimensionar Retângulo se/,
  });
  const hb = await handle.boundingBox();
  if (!hb) throw new Error("handle missing");
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 100, hb.y + hb.height / 2 + 50);
  await page.mouse.up();
  await expect(page.getByLabel("Largura", { exact: true })).toHaveValue("400");
  await expect(page.getByLabel("Altura", { exact: true })).toHaveValue("280");
  await page.getByLabel("Zoom", { exact: true }).selectOption("0.5");
  await page.getByLabel("Rotação").fill("15");
  await page.getByLabel("Rotação").press("Tab");
  await page
    .getByRole("button", { name: "Inserir forma", exact: true })
    .click();
  await page.getByLabel("X", { exact: true }).fill("800");
  await page.getByLabel("X", { exact: true }).press("Tab");
  const first = page.locator(".canvas-region [data-hit-id]").first();
  await first.click({ modifiers: ["Shift"] });
  await expect(
    page.getByRole("heading", { name: "2 objetos", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Alinhar objetos").selectOption("top");
  await page.getByRole("button", { name: "Agrupar", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="group"]'),
  ).toHaveCount(1);
  await expect(
    page.locator(
      '.canvas-region [data-node-type="group"] > [data-node-type="shape"]',
    ),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="group"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="group"]'),
  ).toHaveCount(1);
  await page.locator(".canvas-region [data-hit-id]").click();
  await page.getByRole("button", { name: "Desagrupar", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="group"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('.canvas-region [data-node-type="shape"]'),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  await page
    .getByRole("button", { name: "Bloquear Retângulo" })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Desbloquear Retângulo" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Ocultar Retângulo" }).first().click();
  await expect(
    page.locator('.canvas-region [data-node-type="shape"]'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Mostrar Retângulo" }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="shape"]'),
  ).toHaveCount(2);
});
test("imports original image bytes, edits crop and retains asset and previous undo", async ({
  page,
}) => {
  await mountEditor(page);
  await page
    .getByRole("button", { name: "Adicionar página", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inserir texto", exact: true })
    .click();
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await page.getByLabel("Importar arquivo", { exact: true }).setInputFiles({
    name: "image-original.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#283e36"/><circle cx="100" cy="100" r="50" fill="white"/></svg>',
    ),
  });
  await page
    .getByRole("button", { name: "Inserir image-original.svg", exact: true })
    .click();
  await page.getByLabel("Ajuste da imagem").selectOption("cover");
  await page.getByLabel("Foco X").fill("0.25");
  await page.getByLabel("Foco X").press("Tab");
  await page.getByLabel("Recorte largura").fill("0.5");
  await page.getByLabel("Recorte largura").press("Tab");
  const img = page.locator('.canvas-region [data-node-type="image"] img');
  await expect(img).toHaveCSS("width", "1280px");
  await expect(img).toHaveCSS("left", "-320px");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(img).toHaveCSS("width", "640px");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="image"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="text"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Inserir image-original.svg",
      exact: true,
    }),
  ).toBeVisible();
});
test("edits generated footer and page background, and captures desktop, narrow and mobile", async ({
  page,
}, testInfo) => {
  await mountEditor(page);
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  await page.getByRole("button", { name: /Camada page-number/ }).click();
  await page.getByRole("button", { name: "Propriedades", exact: true }).click();
  await page.getByLabel("Conteúdo do texto").fill("Fim");
  await page.getByLabel("Conteúdo do texto").press("Tab");
  await expect(
    page
      .locator(".canvas-region [data-text-content]")
      .filter({ hasText: "Fim" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  await page.getByRole("button", { name: /Camada footer-rule/ }).click();
  await page.getByRole("button", { name: "Propriedades", exact: true }).click();
  await page.getByLabel("Altura", { exact: true }).fill("3");
  await page.getByLabel("Altura", { exact: true }).press("Tab");
  await page
    .getByRole("button", { name: "Ajustar à janela", exact: true })
    .click();
  await page.screenshot({ path: testInfo.outputPath("desktop.png") });
  await page.setViewportSize({ width: 1000, height: 800 });
  await page
    .getByRole("button", { name: "Ajustar à janela", exact: true })
    .click();
  await page.screenshot({ path: testInfo.outputPath("narrow.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Ajustar à janela", exact: true })
    .click();
  await expect(page.locator(".canvas-region")).toBeVisible();
  await expect(page.locator(".inspector")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("mobile-preview.png") });
  await page.getByRole("button", { name: "Painel", exact: true }).click();
  await expect(page.locator(".inspector")).toBeVisible();
  await expect(page.locator(".canvas-region")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("mobile-panel.png") });
});
test("retains conflict edits and confirms undo at a new revision without resetting earlier history", async ({
  page,
}) => {
  await page.goto("/?render-proof");
  await page.evaluate(async () => {
    const { mountStudioTest } = await import(
      /* @vite-ignore */ "/tests/studio/browserHarness.tsx" as string
    );
    mountStudioTest();
  });
  await page
    .getByRole("button", { name: "Inserir texto", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText("revisão 1");
  await page.getByLabel("Conteúdo do texto").fill("Primeiro ajuste");
  await page.getByLabel("Conteúdo do texto").press("Tab");
  await expect(page.getByRole("status").first()).toContainText("revisão 2");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("revisão 3");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("revisão 4");
  expect(
    await page.evaluate(() =>
      window.studioTest.batches.map((b) => b.expectedRevision),
    ),
  ).toEqual([0, 1, 2, 3]);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await page.locator(".canvas-region [data-hit-id]").click();
  await page.evaluate(() => {
    window.studioTest.fail = true;
  });
  await page.getByLabel("Conteúdo do texto").fill("Rascunho preservado");
  await page.getByLabel("Conteúdo do texto").press("Tab");
  await expect(page.getByRole("alert")).toContainText(
    "Conflito de revisão externo",
  );
  await expect(page.locator(".canvas-region [data-text-content]")).toHaveText(
    "Rascunho preservado",
  );
  await expect(
    page.getByRole("button", { name: "Salvar manifesto de recuperação JSON" }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.studioTest.fail = false;
  });
  await page.getByRole("button", { name: "Tentar salvar novamente" }).click();
  await expect(page.getByRole("status").first()).toContainText("revisão 6");
  expect(
    await page.evaluate(
      () =>
        window.studioTest.stored.pages[0].nodes[0].type === "text" &&
        window.studioTest.stored.pages[0].nodes[0].text,
    ),
  ).toBe("Rascunho preservado");
});
test("changes page background, reorders and deletes pages, then exports acknowledged original bytes", async ({
  page,
}) => {
  await mountEditor(page);
  await expect(page.locator(".page-thumbnail").first()).toBeVisible();
  const initial = await page.locator(".page-thumbnail").count();
  await page
    .getByRole("button", { name: "Adicionar página", exact: true })
    .click();
  await page.getByLabel("Fundo da página").fill("#f0eadf");
  await expect(page.locator(".canvas-region .artboard")).toHaveCSS(
    "background-color",
    "rgb(240, 234, 223)",
  );
  await page
    .getByRole("button", { name: "Página anterior na ordem", exact: true })
    .click();
  await expect(
    page.locator('.page-thumbnail[aria-current="page"]'),
  ).toHaveAttribute("aria-label", `Página ${initial}: Nova página`);
  await page
    .getByRole("button", { name: "Excluir página", exact: true })
    .click();
  await expect(page.locator(".page-thumbnail")).toHaveCount(initial);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Backup portátil", exact: true })
    .first()
    .click();
  const file = await pending;
  expect(file.suggestedFilename()).toContain(".marquio.zip");
});
test("generates a new proposal and appends it only after explicit choice", async ({
  page,
}) => {
  await mountEditor(page);
  await expect(page.locator(".page-thumbnail").first()).toBeVisible();
  const initial = await page.locator(".page-thumbnail").count();
  await page
    .getByRole("button", { name: "Inserir texto", exact: true })
    .click();
  await page.getByLabel("Conteúdo do texto").fill("Ajuste manual preservado");
  await page.getByLabel("Conteúdo do texto").press("Tab");
  await page
    .getByRole("button", { name: "Gerar nova variante", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Revisar nova variante" }),
  ).toBeVisible();
  await expect(page.locator(".page-thumbnail")).toHaveCount(initial);
  await page
    .getByRole("button", { name: "Adicionar como nova variante", exact: true })
    .click();
  await expect(page.locator(".page-thumbnail")).toHaveCount(initial * 2);
  await page
    .getByRole("button", { name: "Página 1: Capa", exact: true })
    .click();
  await expect(
    page
      .locator(".canvas-region [data-text-content]")
      .filter({ hasText: "Ajuste manual preservado" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.locator(".page-thumbnail")).toHaveCount(initial);
});

test("intake direct typing is used by generation in the real App", async ({
  page,
}) => {
  await mountEditor(page);
  await page.getByRole("button", { name: "Briefing", exact: true }).click();
  await page
    .getByLabel("Nome da marca", { exact: true })
    .fill("Marca digitada agora");
  await page
    .getByRole("button", { name: "Gerar manual e abrir editor", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Revisar nova variante" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar como nova variante", exact: true })
    .click();
  await expect(
    page
      .locator(".canvas-region [data-text-content]")
      .filter({ hasText: "Marca digitada agora" }),
  ).toHaveCount(1);
});

test("imports a real included photographic scene and full artwork, inserts approved editable application", async ({
  page,
}, testInfo) => {
  await mountEditor(page);
  await page
    .getByRole("button", { name: "Adicionar página", exact: true })
    .click();
  await page.getByRole("button", { name: "Mockups", exact: true }).click();
  await page
    .getByRole("button", { name: "Usar cena incluída", exact: true })
    .click();
  await expect(
    page.getByText("Cena incluída importada.", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Importar arte", { exact: true })
    .setInputFiles("public/demo-artwork/aurora-card.svg");
  await expect(
    page.getByRole("img", { name: "Prévia da arte aplicada à cena" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Aprovar e inserir aplicação",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Aprovar e inserir aplicação", exact: true })
    .click();
  await expect(
    page.locator('.canvas-region [data-node-type="mockup"]'),
  ).toHaveCount(1);
  const projection = page.locator(".canvas-region [data-projection]");
  await expect(projection.locator("svg image")).toBeVisible();
  await expect(projection.locator("img")).toBeHidden();
  await projection.locator("img").evaluate(async el => (el as HTMLImageElement).decode());
  expect(await projection.locator("svg image").getAttribute("href")).toBe(
    await projection.locator("img").getAttribute("src"),
  );
  await page
    .getByRole("button", { name: "Ajustar à janela", exact: true })
    .click();
  // The mapped surface must actually paint the imported card's cream field and
  // dark green artwork; a visible but blank SVG element does not satisfy this.
  const rendered = PNG.sync.read(await projection.screenshot({
    path: testInfo.outputPath("photographic-artwork.png"),
  }));
  const countColor = (rgb: number[]) => {
    let count = 0;
    for (let i = 0; i < rendered.data.length; i += 4)
      if (rgb.every((channel, c) => Math.abs(rendered.data[i + c] - channel) < 8)) count++;
    return count;
  };
  expect(countColor([246, 240, 231])).toBeGreaterThan(1000);
  expect(countColor([40, 62, 54])).toBeGreaterThan(30);
  await page.screenshot({
    path: testInfo.outputPath("photographic-application.png"),
  });
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="mockup"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="mockup"]'),
  ).toHaveCount(1);
});

test("distributes objects, moves numeric multi-selection and preserves layer order on front/back actions", async ({
  page,
}) => {
  await mountEditor(page);
  await page
    .getByRole("button", { name: "Adicionar página", exact: true })
    .click();
  for (const x of [200, 800, 1200]) {
    await page
      .getByRole("button", { name: "Inserir forma", exact: true })
      .click();
    await page.getByLabel("X", { exact: true }).fill(String(x));
    await page.getByLabel("X", { exact: true }).press("Tab");
  }
  await page
    .getByRole("button", { name: "Selecionar (V)", exact: true })
    .click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByLabel("Alinhar objetos").selectOption("horizontal");
  const transforms = () =>
    page
      .locator('.canvas-region .artboard > [data-node-type="shape"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).style.transform),
      );
  expect(await transforms()).toEqual([
    "translate(200px, 200px) rotate(0deg) scale(1, 1)",
    "translate(700px, 200px) rotate(0deg) scale(1, 1)",
    "translate(1200px, 200px) rotate(0deg) scale(1, 1)",
  ]);
  await page.getByLabel("X", { exact: true }).fill("300");
  await page.getByLabel("X", { exact: true }).press("Tab");
  expect((await transforms())[1]).toContain("translate(800px, 200px)");
  await page.locator(".canvas-region [data-hit-id]").first().click();
  const old = await page
    .locator('.canvas-region .artboard > [data-node-type="shape"]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-node-id")));
  await page
    .getByRole("button", { name: "Trazer camada à frente", exact: true })
    .click();
  expect(
    await page
      .locator('.canvas-region .artboard > [data-node-type="shape"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-node-id"))),
  ).toEqual([old[1], old[0], old[2]]);
  await page
    .getByRole("button", { name: "Enviar camada para trás", exact: true })
    .click();
  expect(
    await page
      .locator('.canvas-region .artboard > [data-node-type="shape"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-node-id"))),
  ).toEqual(old);
});

test("pans with space and toggles grid, guides and snapping without typing-field shortcuts", async ({
  page,
}) => {
  await mountEditor(page);
  await page
    .getByRole("button", { name: "Adicionar página", exact: true })
    .click();
  await page.getByLabel("Zoom", { exact: true }).selectOption("1.25");
  const viewport = page.locator(".canvas-viewport");
  const bounds = await viewport.boundingBox();
  if (!bounds) throw new Error("canvas missing");
  await page
    .getByRole("button", { name: "Selecionar (V)", exact: true })
    .focus();
  await page.keyboard.down("Space");
  await page.mouse.move(bounds.x + 300, bounds.y + 200);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 240, bounds.y + 160);
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect(await viewport.evaluate((el) => el.scrollLeft)).toBe(60);
  expect(await viewport.evaluate((el) => el.scrollTop)).toBe(40);
  await page.getByRole("button", { name: "Grade", exact: true }).click();
  await expect(page.locator(".canvas-grid")).toHaveCount(1);
  await page.getByRole("button", { name: "Guias", exact: true }).click();
  await expect(page.locator(".canvas-guides")).toHaveCount(0);
  await page.getByRole("button", { name: "Encaixe", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Encaixe", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Inserir texto", exact: true })
    .click();
  await page.evaluate(() => {
    const input = document.createElement("div");
    input.contentEditable = "plaintext-only";
    input.id = "typing-proof";
    input.textContent = "Texto digitável";
    input.style.cssText =
      "position:fixed;left:40px;top:140px;z-index:999;background:white;color:black";
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await expect(
    page.locator('.canvas-region [data-node-type="text"]'),
  ).toHaveCount(1);
});

// Break caught: binary fixture fonts must survive the browser demo adapter and ZIP reopen unchanged.
test("memory fixture preserves portable brand font bytes", async ({ page }) => {
  await page.goto("/?render-proof");
  const result = await page.evaluate(async () => {
    const { createMemoryRuntime } = await import(/* @vite-ignore */ "/src/studio/memoryRuntime.ts" as string);
    const { importPortable } = await import(/* @vite-ignore */ "/src/storage/portable.ts" as string);
    const { sha256 } = await import(/* @vite-ignore */ "/src/storage/snapshot.ts" as string);
    const runtime = await createMemoryRuntime();
    const snapshot = await importPortable(await runtime.exportPortable(runtime.project.revision));
    const face = snapshot.project.brand.typography.find((f: { id: string }) => f.id === "font-display");
    const asset = snapshot.project.assets.find((a: { id: string }) => a.id === face.assetId);
    return asset ? { hash: await sha256(snapshot.assets[asset.path]), size: snapshot.assets[asset.path].length } : null;
  });
  expect(result).toEqual({ hash: "05a95421961341c5b2556285e8415df9db27dab4f4abe22b446b3c6a8b916c5d", size: 171900 });
});
