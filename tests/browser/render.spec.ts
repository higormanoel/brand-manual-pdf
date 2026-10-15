import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("shares exact object geometry, loaded media and live text between editor and print", async ({
  page,
}, info) => {
  await page.goto("/?render-proof");
  await expect(page.locator('[data-render-ready="true"]')).toBeVisible();
  const artboard = page.locator('[data-artboard-id="proof-page"]');
  expect(await artboard.boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  });
  const rotated = page.locator('[data-node-id="rotated"]');
  const bounds = await rotated.boundingBox();
  expect(bounds!.x).toBeCloseTo(120, 1);
  expect(bounds!.y).toBeCloseTo(120, 1);
  expect(bounds!.width).toBeCloseTo(80, 1);
  expect(bounds!.height).toBeCloseTo(360, 1);
  await expect(page.locator('[data-node-id="group"]')).toHaveCSS(
    "opacity",
    "0.6",
  );
  await expect(page.locator('[data-node-id="crop"]')).toHaveCSS(
    "overflow",
    "hidden",
  );
  const projection = await page
    .locator("[data-projection]")
    .evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([x, y]) => {
        const p = matrix.transformPoint(new DOMPoint(x, y));
        return [p.x / p.w, p.y / p.w];
      });
    });
  [
    [222.966507177, 66.418703507],
    [557.894736842, 52.603613177],
    [568.421052632, 280.021253985],
    [233.014354067, 300.212539851],
  ].forEach((corner, i) =>
    corner.forEach((n, j) => expect(projection[i][j]).toBeCloseTo(n, 2)),
  );
  const measurement = await page.evaluate(async () => {
    const { measureText } = await import(
      /* @vite-ignore */ "/src/render/textMeasurement.ts" as string
    );
    const style = {
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 400,
      fontStyle: "normal" as const,
      lineHeight: 1.2,
      letterSpacing: 0,
      color: "#0f0f0f",
      align: "left" as const,
      verticalAlign: "top" as const,
    };
    return {
      ok: await measureText({
        text: "Searchable Aurora proof",
        style,
        width: 600,
        height: 80,
      }),
      overflow: await measureText({
        text: "Long copy ".repeat(20),
        style,
        width: 100,
        height: 20,
      }),
      missing: await measureText({
        text: "Test",
        style: { ...style, fontFamily: "Missing-proof-font" },
        width: 100,
      }),
    };
  });
  expect(measurement.ok.fontAvailable).toBe(true);
  expect(measurement.ok.overflow).toBe(false);
  expect(measurement.overflow.overflow).toBe(true);
  expect(measurement.missing.fontAvailable).toBe(false);
  const brokenMedia = await page.evaluate(async () => {
    const { waitForArtboardReady } = await import(
      /* @vite-ignore */ "/src/render/textMeasurement.ts" as string
    );
    const root = document.createElement("div"),
      img = document.createElement("img");
    img.src = "data:image/png;base64,broken";
    root.append(img);
    try {
      await waitForArtboardReady(root);
      return false;
    } catch {
      return true;
    }
  });
  expect(brokenMedia).toBe(true);
  const editorPng = info.outputPath("editor-proof.png");
  await artboard.screenshot({ path: editorPng });
  await page.emulateMedia({ media: "print" });
  const pdfPath = info.outputPath("render-proof.pdf");
  await page.pdf({
    path: pdfPath,
    preferCSSPageSize: true,
    printBackground: true,
  });
  const pdf = await PDFDocument.load(readFileSync(pdfPath));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth()).toBeCloseTo(1920, 1);
  expect(pdf.getPage(0).getHeight()).toBeCloseTo(1080, 1);
  expect(
    execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" }),
  ).toContain("Searchable Aurora proof");
  execFileSync("pdftoppm", [
    "-png",
    "-singlefile",
    "-scale-to-x",
    "1920",
    "-scale-to-y",
    "1080",
    pdfPath,
    info.outputPath("pdf-proof"),
  ]);
  // Independent raster comparison catches dropped CSS projective art in Chromium PDF.
  const { PNG } = await import("pngjs");
  const screen = PNG.sync.read(readFileSync(editorPng));
  const print = PNG.sync.read(readFileSync(info.outputPath("pdf-proof.png")));
  for (const [x, y, r, g, b] of [
    [1120, 370, 221, 244, 171],
    [1300, 400, 37, 74, 66],
    [1300, 520, 228, 138, 81],
  ]) {
    const i = (y * 1920 + x) * 4;
    [r, g, b].forEach((value, c) =>
      expect(Math.abs(print.data[i + c] - value)).toBeLessThan(8),
    );
  }
  for (const [x, y] of [
    [1120, 370],
    [1300, 400],
    [1300, 520],
    [1500, 800],
    [800, 900],
  ]) {
    const i = (y * 1920 + x) * 4;
    for (let c = 0; c < 3; c++)
      expect(Math.abs(screen.data[i + c] - print.data[i + c])).toBeLessThan(12);
  }
});
