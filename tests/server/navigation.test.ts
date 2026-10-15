import { test, expect } from "vitest";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startLocalServer } from "../../src/server/server";
function request(
  origin: string,
  route: string,
  headers: Record<string, string>,
  method = "GET",
  body?: string,
) {
  return new Promise<{
    status: number;
    body: string;
    headers: http.IncomingHttpHeaders;
  }>((resolve, reject) => {
    const req = http.request(origin + route, { method, headers }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () =>
        resolve({ status: res.statusCode!, body: text, headers: res.headers }),
      );
    });
    req.on("error", reject);
    req.end(body);
  });
}
test("extension-initiated cross-site top-level document navigation opens public Studio while private API boundary stays strict", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "marquio-nav-"));
  const staticDir = path.join(folder, "static");
  await fs.mkdir(staticDir);
  await fs.writeFile(
    path.join(staticDir, "index.html"),
    "<title>Marquio Studio</title>",
  );
  const server = await startLocalServer({
    folder: path.join(folder, "project"),
    staticDir,
  });
  const navigation = {
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-User": "?1",
  };
  try {
    const page = await request(server.origin, "/", navigation);
    expect(page.status).toBe(200);
    expect(page.body).toContain("Marquio Studio");
    expect(page.headers["set-cookie"]).toBeUndefined();
    expect(
      (await request(server.origin, "/index.html", navigation)).status,
    ).toBe(200);
    expect(
      (await request(server.origin, "/api/project", navigation)).status,
    ).toBe(403);
    expect(
      (
        await request(server.origin, "/", {
          ...navigation,
          Host: "evil.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(server.origin, "/", {
          ...navigation,
          Origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(server.origin, "/", {
          ...navigation,
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
        })
      ).status,
    ).toBe(403);
    const token = new URLSearchParams(new URL(server.url).hash.slice(1)).get(
      "session",
    );
    const input = JSON.stringify({ token });
    const headers = {
      ...navigation,
      Origin: server.origin,
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(input)),
    };
    expect(
      (await request(server.origin, "/api/session", headers, "POST", input))
        .status,
    ).toBe(403);
    const login = await request(
      server.origin,
      "/api/session",
      {
        Origin: server.origin,
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(input)),
      },
      "POST",
      input,
    );
    expect(login.status).toBe(200);
    const cookie = String(login.headers["set-cookie"]![0]).split(";")[0];
    expect(
      (
        await request(server.origin, "/api/project", {
          ...navigation,
          Cookie: cookie,
        })
      ).status,
    ).toBe(403);
    expect(
      (await request(server.origin, "/api/project", { Cookie: cookie })).status,
    ).toBe(200);
  } finally {
    await server.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
});
