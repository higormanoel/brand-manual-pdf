import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page as BrowserPage } from "playwright";
import { PDFDocument } from "pdf-lib";
import type { ProjectSnapshot } from "../storage/snapshot";
import { createSnapshot } from "../storage/snapshot";
import type { BrowserExportApi } from "./browser";
import type { GenerationResult } from "../editorial/generate";
export interface ExportReport {
  revision: number;
  pages: number;
  dimensions: {
    width: number;
    height: number;
  }[];
  path: string;
}
export function studioDirectory() {
  return (
    process.env.MARQUIO_STUDIO_DIR ??
    fileURLToPath(
      new URL(
        new URL(import.meta.url).pathname.endsWith("/src/export/pdf.ts")
          ? "../../dist/studio/"
          : "../studio/",
        import.meta.url,
      ),
    )
  );
}
async function executable(explicit?: string) {
  if (explicit) return explicit;
  if (process.env.MARQUIO_CHROMIUM_EXECUTABLE)
    return process.env.MARQUIO_CHROMIUM_EXECUTABLE;
  const bundled = chromium.executablePath();
  try {
    await fs.access(bundled);
    return bundled;
  } catch {}
  const paths =
    process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : process.platform === "win32"
        ? [
            `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
            `${process.env["PROGRAMFILES(X86)"]}/Microsoft/Edge/Application/msedge.exe`,
          ]
        : [
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/usr/bin/google-chrome",
          ];
  for (const p of paths)
    try {
      await fs.access(p);
      return p;
    } catch {}
  throw new Error(
    "Chromium indisponível. Execute npx playwright install chromium ou configure MARQUIO_CHROMIUM_EXECUTABLE.",
  );
}
function buildDirectory() {
  return studioDirectory();
}
async function withBrowser<T>(
  snapshot: ProjectSnapshot,
  explicit: string | undefined,
  action: (
    page: BrowserPage,
    wire: {
      project: ProjectSnapshot["project"];
      assets: Record<string, string>;
    },
  ) => Promise<T>,
): Promise<T> {
  const expectedRevision = snapshot.revision;
  const captured = await createSnapshot(snapshot.project, snapshot.assets);
  if (captured.revision !== expectedRevision)
    throw new Error("Snapshot revision mismatch");
  const dir = buildDirectory();
  await fs.access(path.join(dir, "export.html")).catch(() => {
    throw new Error("Build do exportador ausente. Execute npm run build.");
  });
  const server = http.createServer((req, res) => {
    void (async () => {
      const name = new URL(req.url ?? "/", "http://localhost").pathname;
      const relative = decodeURIComponent(name).replace(/^\//, "");
      if (
        relative.split("/").some((p) => p === "..") ||
        relative.includes("\\")
      ) {
        res.writeHead(403).end();
        return;
      }
      const data = await fs.readFile(path.join(dir, relative));
      const ext = path.extname(relative);
      res.setHeader(
        "Content-Type",
        (
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".woff2": "font/woff2",
          } as Record<string, string>
        )[ext] ?? "application/octet-stream",
      );
      res.end(data);
    })().catch(() => res.writeHead(404).end());
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: await executable(explicit),
    });
    const page = await browser.newPage();
    const origin = `http://127.0.0.1:${
      (
        server.address() as {
          port: number;
        }
      ).port
    }`;
    await page.route("**/*", (route) => {
      const u = route.request().url();
      return u.startsWith(origin + "/") ||
        u.startsWith("blob:") ||
        u.startsWith("data:")
        ? route.continue()
        : route.abort("blockedbyclient");
    });
    await page.goto(origin + "/export.html");
    await page.waitForFunction(() =>
      Boolean(
        (
          window as unknown as {
            marquioExport: unknown;
          }
        ).marquioExport,
      ),
    );
    const assets = Object.fromEntries(
      Object.entries(captured.assets).map(([p, b]) => [
        p,
        Buffer.from(b).toString("base64"),
      ]),
    );
    return await action(page, { project: captured.project, assets });
  } catch (e) {
    throw new Error(
      `${e instanceof Error ? e.message : String(e)}\nChromium: npx playwright install chromium; alternativa MARQUIO_CHROMIUM_EXECUTABLE.`,
      { cause: e },
    );
  } finally {
    await browser?.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
}
export async function generateWithBrowser(
  snapshot: ProjectSnapshot,
  variantId: string = crypto.randomUUID(),
): Promise<GenerationResult> {
  return withBrowser(snapshot, undefined, (page, wire) =>
    page.evaluate(
      async ({ wire, variantId }) =>
        (
          window as unknown as {
            marquioExport: BrowserExportApi;
          }
        ).marquioExport.generate(wire, variantId),
      { wire, variantId },
    ),
  );
}
export async function exportPdf({
  snapshot,
  outputPath,
  browserExecutable,
}: {
  snapshot: ProjectSnapshot;
  outputPath: string;
  browserExecutable?: string;
}): Promise<ExportReport> {
  const requestedRevision = snapshot.revision;
  const destination = path.resolve(outputPath);
  const report = await withBrowser(
    snapshot,
    browserExecutable,
    async (page, wire) => {
      const ready = await page.evaluate(
        (w) =>
          (
            window as unknown as {
              marquioExport: BrowserExportApi;
            }
          ).marquioExport.render(w),
        wire,
      );
      const merged = await PDFDocument.create();
      // Separate Chromium captures preserve each page's own media box while retaining searchable text.
      for (let i = 0; i < ready.pages.length; i++) {
        const dim = ready.pages[i];
        await page.evaluate(
          ({ i, width, height }) => {
            document
              .querySelectorAll<HTMLElement>("[data-artboard-sheet]")
              .forEach((el, n) => {
                el.style.display = n === i ? "block" : "none";
                if (n === i) {
                  el.style.width = `${(width * 4) / 3}px`;
                  el.style.height = `${(height * 4) / 3}px`;
                  const art = el.firstElementChild as HTMLElement;
                  art.style.transform = "scale(1.3333333333333333)";
                  art.style.transformOrigin = "0 0";
                }
              });
            const style =
              document.getElementById("pdf-size") ??
              document.head.appendChild(
                Object.assign(document.createElement("style"), {
                  id: "pdf-size",
                }),
              );
            style.textContent = `@page{size:${width}pt ${height}pt;margin:0}@media print{.artboard-sheet{width:${(width * 4) / 3}px!important;height:${(height * 4) / 3}px!important;break-after:auto!important}}`;
          },
          { i, ...dim },
        );
        const bytes = await page.pdf({
          width: `${dim.width / 72}in`,
          height: `${dim.height / 72}in`,
          printBackground: true,
          preferCSSPageSize: true,
          margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
        const doc = await PDFDocument.load(bytes);
        if (doc.getPageCount() !== 1)
          throw new Error(
            `Página ${i + 1}: Chromium produziu ${doc.getPageCount()} páginas.`,
          );
        const actual = doc.getPage(0).getSize();
        if (
          Math.abs(actual.width - dim.width) > 0.25 ||
          Math.abs(actual.height - dim.height) > 0.25
        )
          throw new Error(`Dimensões Chromium divergentes na página ${i + 1}.`);
        const [copied] = await merged.copyPages(doc, [0]);
        copied.setSize(dim.width, dim.height);
        merged.addPage(copied);
      }
      const bytes = await merged.save();
      const verified = await PDFDocument.load(bytes);
      if (verified.getPageCount() !== ready.pages.length)
        throw new Error("Quantidade de páginas PDF divergente.");
      verified.getPages().forEach((p, i) => {
        const d = p.getSize(),
          expected = ready.pages[i];
        if (
          Math.abs(d.width - expected.width) > 0.25 ||
          Math.abs(d.height - expected.height) > 0.25
        )
          throw new Error(`Dimensões divergentes na página ${i + 1}.`);
      });
      return { bytes, dimensions: ready.pages };
    },
  );
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${crypto.randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporary, report.bytes, { flag: "wx" });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return {
    revision: requestedRevision,
    pages: report.dimensions.length,
    dimensions: report.dimensions,
    path: destination,
  };
}
export async function pdfBytes(snapshot: ProjectSnapshot) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-export-"));
  try {
    const report = await exportPdf({
      snapshot,
      outputPath: path.join(dir, "manual.pdf"),
    });
    return { report, bytes: await fs.readFile(report.path) };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
