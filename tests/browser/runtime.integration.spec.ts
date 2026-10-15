import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startLocalServer, type LocalServer } from "../../src/server/server";
import { exportFixture } from "../export/fixture";
let server: LocalServer;
let folder: string;
test.beforeEach(async () => {
  folder = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-runtime-"));
  server = await startLocalServer({ folder, snapshot: await exportFixture() });
});
test.afterEach(async () => {
  await server.close();
  await fs.rm(folder, { recursive: true, force: true });
});
test("production local runtime edits, undo/redo, persists original uploads and reopens from disk on another port", async ({
  page,
}) => {
  await page.goto(server.url);
  await expect(page.getByRole("banner")).toContainText("Projeto local");
  await expect(page).not.toHaveURL(/session=/);
  await page
    .getByRole("button", { name: "Inserir texto", exact: true })
    .click();
  await page.getByLabel("Conteúdo do texto").fill("Persistência real");
  await page.getByLabel("Conteúdo do texto").press("Tab");
  await expect(page.getByRole("status").first()).toContainText("Confirmado");
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Confirmado");
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(page.getByRole("status").first()).toContainText("Confirmado");
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  for (const file of [
    "fixtures/aurora/assets/logo.svg",
    "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
    "public/mockups/card-stack.png",
  ]) {
    await page
      .getByLabel("Importar arquivo", { exact: true })
      .setInputFiles(file);
    await expect(page.getByRole("status").first()).toContainText("Confirmado");
    await expect(
      page.getByLabel("Importar arquivo", { exact: true }),
    ).toBeEnabled();
  }
  const stored = await server.repository.load();
  expect(
    stored.pages[0].nodes.some(
      (n) => n.type === "text" && n.text === "Persistência real",
    ),
  ).toBe(true);
  const old = server.origin;
  await server.close();
  server = await startLocalServer({ folder });
  expect(server.origin).not.toBe(old);
  await page.goto(server.url);
  await expect(page.getByRole("banner")).toContainText("Projeto local");
  await expect(
    page
      .locator(".canvas-region [data-text-content]")
      .filter({ hasText: "Persistência real" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.fonts).some(
          (face) =>
            face.family.includes("Uploaded Proof") && face.status === "loaded",
        ),
      ),
    )
    .toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Backup portátil", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/zip$/);
});
test("opening portable switches to durable browser-only with original bytes; prints all artboards and keeps local folder independent", async ({
  page,
}) => {
  await page.goto(server.url);
  await expect(page.getByRole("banner")).toContainText("Projeto local");
  const original = await server.repository.snapshot(0);
  const { exportPortable, importPortable } = await import(
    "../../src/storage/portable"
  );
  const project = structuredClone(original.project);
  project.pages[1].width = 1920;
  project.pages[1].height = 1080;
  project.title = "Portable browser proof";
  const portable = await exportPortable({
    revision: 0,
    project,
    assets: original.assets,
  });
  await page.getByLabel("Abrir projeto portátil").setInputFiles({
    name: "browser.marquio.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(portable),
  });
  await expect(page.getByRole("banner")).toContainText("Modo navegador");
  await expect(page.getByRole("banner")).toContainText(
    "Portable browser proof",
  );
  await page.reload();
  await expect(page.getByRole("banner")).toContainText("Modo navegador");
  await expect(page.getByRole("banner")).toContainText(
    "Portable browser proof",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Backup portátil", exact: true })
    .first()
    .click();
  const downloaded = await downloadPromise;
  const restored = await importPortable(
    new Uint8Array(await fs.readFile((await downloaded.path())!)),
  );
  expect(restored.project.title).toBe(project.title);
  for (const asset of original.project.assets)
    expect(restored.assets[asset.path]).toEqual(original.assets[asset.path]);
  expect((await server.repository.load()).title).toBe("PDF proof");
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({
    printBackground: true,
    preferCSSPageSize: true,
  });
  const { PDFDocument } = await import("pdf-lib");
  const parsed = await PDFDocument.load(pdf);
  expect(parsed.getPageCount()).toBe(2);
  for (const p of parsed.getPages()) {
    expect(p.getWidth()).toBe(1920);
    expect(p.getHeight()).toBe(1080);
  }
  await fs.writeFile(test.info().outputPath("browser-print.pdf"), pdf);
});
test("three original photographic demo applications remain editable through quad adjustment, artwork replacement, history and reopen", async ({
  page,
}) => {
  test.setTimeout(60000);
  const { runCli } = await import("../../dist/node/cli.js" as string);
  const next = (await runCli(
    ["studio", path.join(folder, "demo"), "--demo", "--no-open"],
    () => {},
  )) as LocalServer;
  await server.close();
  server = next;
  const demo = { project: await server.repository.load() };
  await page.goto(server.url);
  await expect(page.getByRole("banner")).toContainText("Projeto local");
  for (let i = 0; i < 3; i++) {
    const p = demo.project.pages.find((p) => p.id === `demo-application-${i}`)!;
    await page
      .getByRole("button", {
        name: `Página ${demo.project.pages.indexOf(p) + 1}: ${p.title}`,
        exact: true,
      })
      .click();
    await expect(page.locator(".canvas-region [data-projection]")).toHaveCount(
      1,
    );
    await expect
      .poll(() =>
        page
          .locator(".canvas-region img")
          .evaluateAll((imgs) =>
            imgs.every(
              (img) =>
                (img as HTMLImageElement).complete &&
                (img as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await page.locator(".canvas-region").screenshot({
      path: test.info().outputPath(`photo-application-${i}.png`),
    });
  }
  const card = demo.project.pages.find((p) => p.id === "demo-application-0")!;
  await page
    .getByRole("button", {
      name: `Página ${demo.project.pages.indexOf(card) + 1}: ${card.title}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Mockups", exact: true }).click();
  await expect(page.locator(".mockups-requirements li")).not.toHaveCount(0);
  await expect(page.getByLabel("Prompt resolvido")).toHaveCount(0);
  const photo = page.getByAltText("Cartões sobre madeira", { exact: true });
  await expect
    .poll(() => photo.evaluate((img) => (img as HTMLImageElement).naturalWidth))
    .toBe(1672);
  await page
    .getByRole("button", { name: "Usar cena incluída", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: /^Arte completa da aplicação/ })
    .selectOption("demo-art-0");
  await page.getByLabel("Superior esquerdo X", { exact: true }).fill("750");
  await expect(
    page.getByRole("img", { name: "Prévia da arte aplicada à cena" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aprovar e inserir aplicação", exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText("Confirmado");
  const withNew = await server.repository.load();
  const inserted = withNew.pages.find((p) => p.id === card.id)!.nodes.at(-1)!;
  expect(inserted.type).toBe("mockup");
  if (inserted.type !== "mockup") throw new Error("mockup missing");
  expect(inserted.quad![0].x).toBeCloseTo((750 / 1672) * 960);
  const count = withNew.pages.find((p) => p.id === card.id)!.nodes.length;
  await page.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="mockup"]'),
  ).toHaveCount(count - 1);
  await page.getByRole("button", { name: "Refazer", exact: true }).click();
  await expect(
    page.locator('.canvas-region [data-node-type="mockup"]'),
  ).toHaveCount(count);
  await page.getByRole("button", { name: "Camadas", exact: true }).click();
  await page
    .getByRole("button", { name: `Camada ${inserted.name}`, exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Propriedades", exact: true }).click();
  const expectedQuad = structuredClone(inserted.quad!);
  expectedQuad[0].x += 5;
  await page
    .getByLabel("Canto superior esquerdo X", { exact: true })
    .fill(String(expectedQuad[0].x));
  await page
    .getByLabel("Canto superior esquerdo X", { exact: true })
    .press("Tab");
  await page
    .getByRole("button", { name: "Aplicar perspectiva", exact: true })
    .click();
  await page
    .getByLabel("Cena da aplicação", { exact: true })
    .selectOption("demo-scene-0");
  for (const label of ["Máscara da aplicação", "Sobreposição da aplicação"]) {
    await page.getByLabel(label, { exact: true }).selectOption("demo-art-0");
    await page.getByLabel(label, { exact: true }).selectOption("");
  }
  await expect(page.getByRole("status").first()).toContainText("Confirmado");
  const edited = (await server.repository.load()).pages
    .find((p) => p.id === card.id)!
    .nodes.at(-1)!;
  if (edited.type !== "mockup") throw new Error("Edited mockup missing");
  expect(edited.quad).toEqual(expectedQuad);
  expect(edited.type === "mockup" && edited.sceneAssetId).toBe("demo-scene-0");
  expect(edited.type === "mockup" && edited.maskAssetId).toBeUndefined();
  expect(edited.type === "mockup" && edited.overlayAssetId).toBeUndefined();
  await page.getByRole("button", { name: "Assets", exact: true }).click();
  const alternate = (
    await fs.readFile("public/demo-artwork/aurora-card.svg", "utf8")
  ).replaceAll("#283E36", "#2D463D");
  await page.getByLabel("Importar arquivo", { exact: true }).setInputFiles({
    name: "alternative-card.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(alternate),
  });
  await expect(
    page.getByLabel("Importar arquivo", { exact: true }),
  ).toBeEnabled();
  const imported = (await server.repository.load()).assets.find(
    (a) => a.name === "alternative-card.svg",
  )!;
  await page.getByRole("button", { name: "Propriedades", exact: true }).click();
  await page
    .getByLabel("Arte da aplicação", { exact: true })
    .selectOption(imported.id);
  await expect(page.getByRole("status").first()).toContainText("Confirmado");
  const changed = (await server.repository.load()).pages
    .find((p) => p.id === card.id)!
    .nodes.at(-1)!;
  expect(changed.type === "mockup" && changed.quad).toEqual(edited.quad);
  expect(changed.type === "mockup" && changed.artworkAssetId).toBe(imported.id);
  expect(changed.approval.status).toBe("pending");
  const reopenedFolder = path.join(folder, "demo");
  await server.close();
  server = await startLocalServer({ folder: reopenedFolder });
  await page.goto(server.url);
  const persisted = (await server.repository.load()).pages
    .find((p) => p.id === card.id)!
    .nodes.at(-1)!;
  expect(persisted).toEqual(changed);
});
test("pending local recovery offers backup and explicit browser copy while external disk edits stay confirmed", async ({
  page,
}) => {
  await page.goto(server.url);
  await expect(page.getByRole("banner")).toContainText("Projeto local");
  const snapshot = await server.repository.snapshot(0);
  const pending = structuredClone(snapshot.project);
  pending.title = "Pending visible title";
  const bytes = Object.fromEntries(
    Object.entries(snapshot.assets).map(([p, b]) => [p, Array.from(b)]),
  );
  await page.evaluate(
    async ({ pending, bytes }) => {
      const request = indexedDB.open("marquio-recovery-v1", 1);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("projects", "readwrite");
        tx.objectStore("projects").put(
          {
            version: 1,
            project: pending,
            assets: Object.fromEntries(
              Object.entries(bytes).map(([p, b]) => [p, Uint8Array.from(b)]),
            ),
            pending: [
              {
                commandId: "unsent-edit",
                expectedRevision: 0,
                commands: [
                  { type: "project.update", patch: { title: pending.title } },
                ],
              },
            ],
            confirmedRevision: 0,
            mode: "local",
            status: "pending",
            updatedAt: new Date().toISOString(),
          },
          `project:${pending.id}:schema:1`,
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { pending, bytes },
  );
  await server.repository.commit({
    commandId: "external-edit",
    expectedRevision: 0,
    commands: [
      { type: "project.update", patch: { title: "Confirmed external title" } },
    ],
  });
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Alterações não confirmadas recuperáveis",
    }),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar backup pendente" }).click();
  const download = await downloading;
  const { importPortable } = await import("../../src/storage/portable");
  const backup = await importPortable(
    new Uint8Array(await fs.readFile((await download.path())!)),
  );
  expect(backup.project.title).toContain("Pending visible title");
  expect(backup.project.title).toContain("não confirmada");
  for (const a of snapshot.project.assets)
    expect(backup.assets[a.path]).toEqual(snapshot.assets[a.path]);
  await page
    .getByRole("button", { name: "Recuperar como cópia no navegador" })
    .click();
  await expect(page.getByRole("banner")).toContainText("Modo navegador");
  await expect(page.getByRole("banner")).toContainText("Pending visible title");
  expect((await server.repository.load()).title).toBe(
    "Confirmed external title",
  );
  expect((await server.repository.load()).revision).toBe(1);
});
