import { test, expect } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startStudio, runCli } from "../../src/cli/cli";
import { ProjectRepository } from "../../src/storage/repository";
test("occupied requested port selects a ready loopback port without opening a browser", async () => {
  const blocker = http.createServer();
  await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", r));
  const port = (
    blocker.address() as {
      port: number;
    }
  ).port;
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-cli-"));
  let studio: Awaited<ReturnType<typeof startStudio>> | undefined;
  try {
    studio = await startStudio({ folder, port, open: false });
    expect(new URL(studio.url).port).not.toBe(String(port));
    expect((await fetch(studio.url)).status).toBe(200);
  } finally {
    await studio?.close();
    blocker.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
});
test("apply and import-asset use latest immutable canonical revision", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-cli-"));
  const repo = await ProjectRepository.open(folder);
  const batch = path.join(folder, "batch.json");
  try {
    await fs.writeFile(
      batch,
      JSON.stringify({
        commandId: "agent-edit",
        expectedRevision: 0,
        commands: [{ type: "project.update", patch: { title: "Agent edit" } }],
      }),
    );
    await runCli(["apply", folder, "--batch", batch], () => {});
    expect((await repo.load()).title).toBe("Agent edit");
    const file = path.join(folder, "logo.svg");
    await fs.writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await runCli(
      [
        "import-asset",
        folder,
        file,
        "--revision",
        "1",
        "--command-id",
        "agent-asset",
      ],
      () => {},
    );
    expect((await repo.load()).revision).toBe(2);
    expect((await repo.load()).assets).toHaveLength(1);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
import { spawn } from "node:child_process";
test("built no-open CLI prints actual ready URL and stays alive until signaled", async () => {
  const folder = await fs.mkdtemp(
    path.join(os.tmpdir(), "marquio-cli-process-"),
  );
  const child = spawn(
    process.execPath,
    ["bin/marquio.mjs", "studio", folder, "--no-open"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let output = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        output += String(chunk);
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#[^\s]+/);
        if (match) resolve(match[0]);
      });
      child.stderr.on("data", (chunk) => (stderr += String(chunk)));
      child.once("exit", (code) =>
        reject(new Error(`CLI exited ${code}: ${stderr}`)),
      );
      setTimeout(
        () => reject(new Error("CLI did not publish URL")),
        10000,
      ).unref();
    });
    expect((await fetch(url)).status).toBe(200);
    expect(child.exitCode).toBeNull();
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((r) => child.once("exit", () => r()));
    await fs.rm(folder, { recursive: true, force: true });
  }
}, 15000);
