import { test, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { exportPdf } from "../../src/export/pdf";
import { createProject } from "../../src/core/project";
test("unavailable Chromium preserves the previous PDF and rejects", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-pdf-"));
  const outputPath = path.join(dir, "manual.pdf");
  await fs.writeFile(outputPath, "previous");
  const project = createProject("Test");
  try {
    await expect(
      exportPdf({
        snapshot: { revision: 0, project, assets: {} },
        outputPath,
        browserExecutable: "/missing/chromium",
      }),
    ).rejects.toThrow();
    expect(await fs.readFile(outputPath, "utf8")).toBe("previous");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
import { exportFixture } from "./fixture";
import { PDFDocument } from "pdf-lib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createSnapshot } from "../../src/storage/snapshot";
test("real Chromium exports uploaded font, crop, rotation, transparency and varied page sizes as searchable immutable PDF", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-pdf-real-"));
  try {
    const snapshot = await exportFixture();
    const outputPath = path.join(dir, "manual.pdf");
    const report = await exportPdf({ snapshot, outputPath });
    expect(report.revision).toBe(0);
    expect(report.pages).toBe(2);
    expect(report.dimensions).toEqual([
      { width: 1920, height: 1080 },
      { width: 1200, height: 800 },
    ]);
    const pdf = await PDFDocument.load(await fs.readFile(outputPath));
    expect(pdf.getPages().map((p) => p.getSize())).toEqual(report.dimensions);
    const { stdout } = await promisify(execFile)("pdftotext", [
      outputPath,
      "-",
    ]);
    expect(stdout).toContain("SEARCHABLE AURORA uploaded original");
    expect(stdout).toContain("SECOND PAGE immutable revision zero");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}, 60000);
test("corrupt image and unavailable font reject without replacing a prior PDF", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-pdf-failure-"));
  try {
    const good = await exportFixture();
    const outputPath = path.join(dir, "manual.pdf");
    await fs.writeFile(outputPath, "previous PDF");
    for (const id of ["image-proof", "font-proof"]) {
      const project = structuredClone(good.project);
      const asset = project.assets.find((a) => a.id === id)!;
      const bad = new TextEncoder().encode("invalid bytes");
      const { createHash } = await import("node:crypto");
      asset.hash = createHash("sha256").update(bad).digest("hex");
      const snap = await createSnapshot(project, {
        ...good.assets,
        [asset.path]: bad,
      });
      await expect(exportPdf({ snapshot: snap, outputPath })).rejects.toThrow();
      expect(await fs.readFile(outputPath, "utf8")).toBe("previous PDF");
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}, 60000);
import { startLocalServer } from "../../src/server/server";
test("authenticated PDF route exports retained requested revision while a new canonical edit commits", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-export-race-"));
  const snapshot = await exportFixture();
  const server = await startLocalServer({ folder: dir, snapshot });
  try {
    const origin = server.origin;
    const token = new URLSearchParams(new URL(server.url).hash.slice(1)).get(
      "session",
    );
    const exchange = await fetch(origin + "/api/session", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const cookie = exchange.headers.get("set-cookie")!.split(";")[0];
    expect((await fetch(origin + "/api/pdf?revision=0")).status).toBe(401);
    const exporting = fetch(origin + "/api/pdf?revision=0", {
      headers: { Cookie: cookie },
    });
    await server.repository.commit({
      commandId: "concurrent-edit",
      expectedRevision: 0,
      commands: [
        {
          type: "node.update",
          pageId: "page-first",
          nodeId: "text-proof",
          patch: { text: "NEW REVISION MUST NOT LEAK" },
        },
      ],
    });
    const response = await exporting;
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Marquio-Revision")).toBe("0");
    const outputPath = path.join(dir, "race.pdf");
    await fs.writeFile(
      outputPath,
      new Uint8Array(await response.arrayBuffer()),
    );
    const { stdout } = await promisify(execFile)("pdftotext", [
      outputPath,
      "-",
    ]);
    expect(stdout).toContain("SEARCHABLE AURORA");
    expect(stdout).not.toContain("NEW REVISION");
    expect((await server.repository.load()).revision).toBe(1);
  } finally {
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}, 60000);
