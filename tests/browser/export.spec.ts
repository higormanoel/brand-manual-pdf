import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startLocalServer } from "../../src/server/server";
import { exportFixture } from "../export/fixture";
import { PDFDocument } from "pdf-lib";
test("actual production local export flushes delayed save and previews the exact requested revision", async ({
  page,
}) => {
  test.setTimeout(60000);
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "marquio-browser-pdf-"),
  );
  const server = await startLocalServer({
    folder,
    snapshot: await exportFixture(),
  });
  try {
    await page.goto(server.url);
    await expect(page.getByRole("banner")).toContainText("Projeto local");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/commands", async (route) => {
      await gate;
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Inserir texto", exact: true })
      .click();
    const exporting = page.waitForResponse((r) =>
      r.url().includes("/api/pdf?revision="),
    );
    await page
      .getByRole("button", { name: "Exportar PDF", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Exportar PDF", exact: true }),
    ).toBeDisabled();
    release();
    const response = await exporting;
    expect(response.ok()).toBe(true);
    const revision = Number(response.headers()["x-marquio-revision"]);
    expect(revision).toBeGreaterThan(0);
    await expect(
      page
        .getByRole("dialog")
        .filter({
          has: page.getByText(`PDF · revisão ${revision} · 2 páginas`),
        }),
    ).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Baixar PDF", exact: true }).click();
    const download = await downloadPromise;
    const bytes = await fs.readFile((await download.path())!);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    await page.screenshot({ path: test.info().outputPath("pdf-preview.png") });
  } finally {
    await server.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
});
