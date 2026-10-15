import fs from "node:fs/promises";
import path from "node:path";
import { installAgent } from "./install";
import { startLocalServer, type LocalServer } from "../server/server";
import { ProjectRepository } from "../storage/repository";
import { createProject } from "../core/project";
import { exportPdf, generateWithBrowser, studioDirectory } from "../export/pdf";
import { demoSnapshot } from "./demo";
import { openBrowser } from "./openBrowser";
export async function startStudio(options: {
  folder: string;
  port?: number;
  open?: boolean;
  name?: string;
  demo?: boolean;
}): Promise<LocalServer> {
  const folder = path.resolve(options.folder);
  let snapshot;
  if (options.demo) {
    try {
      await fs.access(path.join(folder, "project.marquio.json"));
    } catch {
      snapshot = await demoSnapshot();
    }
  }
  let server: LocalServer;
  const staticDir = studioDirectory();
  try {
    server = await startLocalServer({
      folder,
      port: options.port,
      staticDir,
      snapshot,
      project: options.name ? createProject(options.name) : undefined,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
    server = await startLocalServer({ folder, port: 0, staticDir });
  }
  if (options.open !== false)
    try {
      await openBrowser(server.url);
    } catch (error) {
      await server.close();
      throw error;
    }
  return server;
}
function option(args: string[], name: string) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`Falta o valor de ${name}`);
  return value;
}
function integer(value: string | undefined, label: string, required = false) {
  if (value === undefined) {
    if (required) throw new Error(`${label} é obrigatório`);
    return undefined;
  }
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n))
    throw new Error(`${label} deve ser um inteiro positivo`);
  return n;
}
function mime(filename: string) {
  return (
    (
      {
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".otf": "font/otf",
      } as Record<string, string>
    )[path.extname(filename).toLowerCase()] ?? "application/octet-stream"
  );
}
export async function runCli(
  args: string[],
  write: (value: string) => void = console.log,
): Promise<LocalServer | undefined> {
  const [command, folderArg] = args;
  const folder =
    folderArg && !folderArg.startsWith("--") ? folderArg : undefined;
  if (!command || command === "--help" || command === "help") {
    write(
      "marquio studio [pasta] [--name Nome] [--demo] [--port N] [--no-open]\nmarquio install --agent codex|claude [--target pasta] [--force]\nmarquio validate <pasta>\nmarquio generate <pasta> [--variant ID]\nmarquio export <pasta> --output manual.pdf [--revision N]\nmarquio apply <pasta> --batch lote.json\nmarquio import-asset <pasta> <arquivo> --revision N --command-id ID",
    );
    return;
  }
  if (command === "install") {
    const agent = option(args, "--agent");
    if (agent !== "codex" && agent !== "claude")
      throw new Error("--agent codex ou claude é obrigatório");
    write(
      JSON.stringify(
        await installAgent({
          agent,
          targetRoot: option(args, "--target") ?? process.cwd(),
          overwrite: args.includes("--force"),
        }),
      ),
    );
    return;
  }
  if (command === "studio") {
    const server = await startStudio({
      folder: folder ?? path.resolve("marquio-project"),
      port: integer(option(args, "--port"), "--port"),
      open: !args.includes("--no-open"),
      name: option(args, "--name"),
      demo: args.includes("--demo"),
    });
    write(server.url);
    return server;
  }
  if (!folder) throw new Error("Informe a pasta do projeto.");
  await fs.access(path.join(folder, "project.marquio.json"));
  const repo = await ProjectRepository.open(folder);
  const project = await repo.load();
  if (command === "validate") {
    write(
      JSON.stringify({
        valid: true,
        revision: project.revision,
        pages: project.pages.length,
        assets: project.assets.length,
        ...(args.includes("--json") ? { project } : {}),
      }),
    );
    return;
  }
  if (command === "apply") {
    const file = option(args, "--batch");
    if (!file) throw new Error("--batch é obrigatório");
    write(
      JSON.stringify(
        await repo.commit(JSON.parse(await fs.readFile(file, "utf8"))),
      ),
    );
    return;
  }
  if (command === "import-asset") {
    const file = args[2];
    if (!file || file.startsWith("--"))
      throw new Error("Informe o arquivo de asset");
    const commandId = option(args, "--command-id");
    if (!commandId) throw new Error("--command-id é obrigatório");
    const expectedRevision = integer(
      option(args, "--revision"),
      "--revision",
      true,
    )!;
    write(
      JSON.stringify(
        await repo.importAsset(
          {
            name: path.basename(file),
            mimeType: mime(file),
            bytes: new Uint8Array(await fs.readFile(file)),
            origin: { kind: "provided" },
          },
          { commandId, expectedRevision },
        ),
      ),
    );
    return;
  }
  if (command === "generate") {
    const result = await generateWithBrowser(
      await repo.snapshot(project.revision),
      option(args, "--variant"),
    );
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    if (errors.length) throw new Error(errors.map((d) => d.message).join("\n"));
    const ack = await repo.commit({
      commandId: option(args, "--command-id") ?? crypto.randomUUID(),
      expectedRevision: project.revision,
      commands: [
        {
          type: "variant.install",
          mode: "append",
          pages: result.sections.flatMap((s) => s.pages),
        },
      ],
    });
    write(
      JSON.stringify({
        revision: ack.revision,
        pages: ack.project.pages.length,
        diagnostics: result.diagnostics,
      }),
    );
    return;
  }
  if (command === "export") {
    const outputPath = option(args, "--output");
    if (!outputPath) throw new Error("--output é obrigatório");
    write(
      JSON.stringify(
        await exportPdf({
          snapshot: await repo.snapshot(
            integer(option(args, "--revision"), "--revision") ??
              project.revision,
          ),
          outputPath,
          browserExecutable: option(args, "--browser"),
        }),
      ),
    );
    return;
  }
  throw new Error(`Comando desconhecido: ${command}`);
}
