import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { startLocalServer } from "../../src/server/server";
import { exportFixture } from "../export/fixture";
import { exportPortable, importPortable } from "../../src/storage/portable";
test("two actual browser tabs preserve confirmed work and stale visible recovery with all asset bytes", async ({
  page,
  context,
}) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-tabs-"));
  const snapshot = await exportFixture();
  const server = await startLocalServer({ folder, snapshot });
  let other: Awaited<ReturnType<typeof context.newPage>> | undefined;
  try {
    await page.goto(server.url);
    await expect(page.getByRole("banner")).toContainText("Projeto local");
    const portable = await exportPortable(snapshot);
    await page.getByLabel("Abrir projeto portátil").setInputFiles({
      name: "tabs.marquio.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(portable),
    });
    await expect(page.getByRole("banner")).toContainText("Modo navegador");
    other = await context.newPage();
    await other.goto(page.url());
    await expect(other.getByRole("banner")).toContainText("Modo navegador");
    await page
      .getByRole("button", { name: "Inserir texto", exact: true })
      .click();
    await page.getByLabel("Conteúdo do texto").fill("A acknowledged tab");
    await page.getByLabel("Conteúdo do texto").press("Tab");
    await expect(page.getByRole("status").first()).toContainText("revisão 2");
    await other
      .getByRole("button", { name: "Inserir texto", exact: true })
      .click();
    await expect(other.getByRole("status").first()).toContainText("Conflito");
    await other.getByLabel("Conteúdo do texto").fill("B visible pending");
    await other.getByLabel("Conteúdo do texto").press("Tab");
    const downloading = other.waitForEvent("download");
    await other
      .getByRole("button", { name: "Baixar recuperação completa", exact: true })
      .click();
    const backup = await importPortable(
      new Uint8Array(await fs.readFile((await (await downloading).path())!)),
    );
    expect(
      backup.project.pages[0].nodes.some(
        (n) => n.type === "text" && n.text === "B visible pending",
      ),
    ).toBe(true);
    for (const asset of snapshot.project.assets)
      expect(backup.assets[asset.path]).toEqual(snapshot.assets[asset.path]);
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Alterações não confirmadas recuperáveis",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Usar projeto confirmado", exact: true })
      .click();
    await expect(
      page
        .locator(".canvas-region [data-text-content]")
        .filter({ hasText: "A acknowledged tab" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".canvas-region [data-text-content]")
        .filter({ hasText: "B visible pending" }),
    ).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath("confirmed-after-stale-tab.png"),
    });
  } finally {
    await other?.close();
    await server.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
});
test("opening an older portable with an existing browser ID opens a separate copy without replacing its confirmed state", async ({
  page,
}) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-open-copy-"));
  const snapshot = await exportFixture();
  const server = await startLocalServer({ folder, snapshot });
  try {
    await page.goto(server.url);
    const bytes = await exportPortable(snapshot);
    const file = {
      name: "copy.marquio.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(bytes),
    };
    await page.getByLabel("Abrir projeto portátil").setInputFiles(file);
    await expect(page.getByRole("banner")).toContainText("Modo navegador");
    await page
      .getByRole("button", { name: "Inserir texto", exact: true })
      .click();
    await expect(page.getByRole("status").first()).toContainText("revisão 1");
    await page.getByLabel("Abrir projeto portátil").setInputFiles(file);
    await expect(
      page.locator('.canvas-region [data-node-type="text"]'),
    ).toHaveCount(1);
    await expect(page.getByRole("status").first()).toContainText("revisão 0");
    await expect(page.getByRole("alert")).toHaveCount(0);
    const canonical = await page.evaluate(async (id) => {
      const open = indexedDB.open("marquio-browser-confirmed-v1", 1);
      const db = await new Promise<IDBDatabase>((r, j) => {
        open.onsuccess = () => r(open.result);
        open.onerror = () => j(open.error);
      });
      const record = await new Promise<{ project: { revision: number } }>(
        (r, j) => {
          const tx = db.transaction("projects");
          const request = tx
            .objectStore("projects")
            .get(`project:${id}:schema:1`);
          request.onsuccess = () => r(request.result);
          request.onerror = () => j(request.error);
        },
      );
      db.close();
      return record.project;
    }, snapshot.project.id);
    expect(canonical.revision).toBe(1);
  } finally {
    await server.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
});
