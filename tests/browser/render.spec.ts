import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

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
  await expect(
    page.locator(
      '[data-node-id="mask-overlay-proof"] img[data-asset-id="proof-mask"]',
    ),
  ).toHaveCount(1);
  await expect(
    page.locator(
      '[data-node-id="mask-overlay-proof"] img[data-asset-id="proof-overlay"]',
    ),
  ).toHaveCount(1);
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
    [1000, 850, 221, 244, 171],
    [1170, 850, 255, 255, 255],
    [1275, 865, 49, 89, 173],
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
    [1000, 850],
    [1170, 850],
    [1275, 865],
  ]) {
    const i = (y * 1920 + x) * 4;
    for (let c = 0; c < 3; c++)
      expect(Math.abs(screen.data[i + c] - print.data[i + c])).toBeLessThan(12);
  }
});

test("measures a cold Unicode subset using the loaded font on the first call", async ({
  page,
}, info) => {
  await page.goto("/?render-proof");
  await expect(page.locator('[data-render-ready="true"]')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { measureText } = await import(
      "/src/render/textMeasurement.ts" as string
    );
    const text = "тттттттттт";
    const style = {
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 400,
      fontStyle: "normal",
      lineHeight: 1.2,
      letterSpacing: 0,
      color: "#000000",
      align: "left",
      verticalAlign: "top",
    };
    const first = await measureText({ text, style, width: 150, height: 40 });
    await document.fonts.load("normal 400 32px Inter", text);
    const loaded = await measureText({ text, style, width: 150, height: 40 });
    return { first, loaded };
  });
  const metricsPath = info.outputPath("cold-font-measurements.json");
  writeFileSync(metricsPath, JSON.stringify(result, null, 2));
  await info.attach("cold-font-measurements.json", {
    path: metricsPath,
    contentType: "application/json",
  });
  expect(result.first.height).toBe(result.loaded.height);
  expect(result.first.fontAvailable).toBe(true);
  expect(result.first.overflow).toBe(true);
});

test("accepts CSS family stacks and quoted uploaded families while reporting real substitution", async ({
  page,
}) => {
  await page.goto("/?render-proof");
  await expect(page.locator('[data-render-ready="true"]')).toBeVisible();
  const results = await page.evaluate(async () => {
    const { measureText } = await import(
      "/src/render/textMeasurement.ts" as string
    );
    const uploaded = new FontFace(
      "Marquio Uploaded, Proof",
      "url(/node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2)",
    );
    document.fonts.add(await uploaded.load());
    const style = {
      fontSize: 32,
      fontWeight: 400,
      fontStyle: "normal",
      lineHeight: 1.2,
      letterSpacing: 0,
      color: "#000000",
      align: "left",
      verticalAlign: "top",
    };
    return Promise.all(
      [
        "Inter",
        "Inter, sans-serif",
        '"Inter", sans-serif',
        '"Marquio Uploaded, Proof", serif',
        "Missing-proof-font, Inter, sans-serif",
      ].map((fontFamily) =>
        measureText({
          text: "Uploaded proof",
          style: { ...style, fontFamily },
          width: 250,
          height: 50,
        }),
      ),
    );
  });
  expect(results.map((result) => result.fontAvailable)).toEqual([
    true,
    true,
    true,
    true,
    false,
  ]);
  expect(results.slice(1, 4).map((result) => result.height)).toEqual([
    results[0].height,
    results[0].height,
    results[0].height,
  ]);
});

for (const mode of ["client", "ssr"] as const)
  test(`fills rectangular SVG and raster surfaces through all edges in ${mode} browser and PDF`, async ({
    page,
  }, info) => {
    await page.goto("/?render-proof");
    await expect(page.locator('[data-render-ready="true"]')).toBeVisible();
    const {
      sources,
    }: {
      sources: { id: string; x: number; y: number; w: number; h: number }[];
    } = await page.evaluate(async (mode) => {
      const { mountProjectionProof } = await import(
        "/tests/render/projectionHarness.tsx" as string
      );
      return mountProjectionProof(mode);
    }, mode);
    const screenPath = info.outputPath("rectangular-sources.png");
    await page
      .locator('[data-artboard-id="projection-proof"]')
      .screenshot({ path: screenPath });
    await page.emulateMedia({ media: "print" });
    const pdfPath = info.outputPath("rectangular-sources.pdf");
    await page.pdf({
      path: pdfPath,
      preferCSSPageSize: true,
      printBackground: true,
    });
    const pdf = await PDFDocument.load(readFileSync(pdfPath));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 1920, height: 1080 });
    execFileSync("pdftoppm", [
      "-png",
      "-singlefile",
      "-scale-to-x",
      "1920",
      "-scale-to-y",
      "1080",
      pdfPath,
      info.outputPath("rectangular-sources-pdf"),
    ]);
    const { PNG } = await import("pngjs");
    const screen = PNG.sync.read(readFileSync(screenPath)),
      print = PNG.sync.read(
        readFileSync(info.outputPath("rectangular-sources-pdf.png")),
      );
    const samples = sources.flatMap((source) =>
      [
        [0.05, 0.05, 206, 57, 44],
        [0.95, 0.05, 49, 89, 173],
        [0.95, 0.95, 228, 138, 81],
        [0.05, 0.95, 221, 244, 171],
        [0.5, 0.05, 40, 62, 54],
        [0.95, 0.5, 40, 62, 54],
        [0.5, 0.95, 40, 62, 54],
        [0.05, 0.5, 40, 62, 54],
      ].map(([u, v, r, g, b]) => ({
        id: source.id,
        x: Math.round(source.x + source.w * u),
        y: Math.round(source.y + source.h * v),
        rgb: [r, g, b],
      })),
    );
    // Real original portrait source must reach both edges of the calibrated frame.
    samples.push(
      { id: "real-poster-left", x: 1382, y: 219, rgb: [40, 62, 54] },
      { id: "real-poster-right", x: 1520, y: 219, rgb: [40, 62, 54] },
    );
    const evidence = samples.map((s) => ({
      ...s,
      screen: [
        ...screen.data.subarray(
          (s.y * 1920 + s.x) * 4,
          (s.y * 1920 + s.x) * 4 + 3,
        ),
      ],
      pdf: [
        ...print.data.subarray(
          (s.y * 1920 + s.x) * 4,
          (s.y * 1920 + s.x) * 4 + 3,
        ),
      ],
    }));
    writeFileSync(
      info.outputPath("projection-edge-pixels.json"),
      JSON.stringify(evidence, null, 2),
    );
    for (const sample of evidence)
      for (let channel = 0; channel < 3; channel++) {
        expect(
          Math.abs(sample.screen[channel] - sample.rgb[channel]),
          `${sample.id} browser ${sample.x},${sample.y}`,
        ).toBeLessThan(12);
        expect(
          Math.abs(sample.pdf[channel] - sample.rgb[channel]),
          `${sample.id} PDF ${sample.x},${sample.y}`,
        ).toBeLessThan(12);
      }
  });
