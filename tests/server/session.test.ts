import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createProject } from '../../src/core/project';
import { startLocalServer } from '../../src/server/server';
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function setup() {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-server-')); cleanups.push(() => fs.rm(folder, { recursive: true, force: true }));
  const server = await startLocalServer({ folder, project: createProject('Local'), port: 0 }); cleanups.push(() => server.close()); return { ...server, folder };
}
async function login(server: Awaited<ReturnType<typeof startLocalServer>>) {
  const token = new URL(server.url).hash.slice('#session='.length);
  const response = await fetch(`${server.origin}/api/session`, { method: 'POST', headers: { Origin: server.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
  expect(response.status).toBe(200); return response.headers.get('set-cookie')!.split(';')[0];
}
describe('local server boundary', () => {
  it('exchanges fragment token once, gates private assets and rejects hostile origins/hosts', async () => {
    const server = await setup(); expect((await fetch(`${server.origin}/api/project`)).status).toBe(401);
    const cookie = await login(server);
    expect((await fetch(`${server.origin}/api/project`, { headers: { Cookie: cookie } })).status).toBe(200);
    const again = await fetch(`${server.origin}/api/session`, { method: 'POST', headers: { Origin: server.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: new URL(server.url).hash.slice(9) }) }); expect(again.status).toBe(401);
    expect((await fetch(`${server.origin}/api/project`, { headers: { Cookie: cookie, Origin: 'https://evil.example' } })).status).toBe(403);
    expect((await fetch(`${server.origin}/assets/unknown`, { headers: { Cookie: cookie } })).status).toBe(404);
    expect((await fetch(`${server.origin}/api/assets/x`)).status).toBe(401);
    const status = await new Promise<number>(resolve => { const req = http.get(`${server.origin}/api/project`, { headers: { Host: 'evil.example', Cookie: cookie } }, res => { res.resume(); resolve(res.statusCode!); }); req.on('error', () => resolve(0)); }); expect(status).toBe(403);
    expect((await fetch(`${server.origin}/api/project`, { method: 'POST', headers: { Cookie: cookie } })).status).toBe(403);
  });
  it('returns conflict without overwriting, confirms asset revision and reopens disk data at a different port', async () => {
    const server = await setup(); const cookie = await login(server);
    const headers = { Origin: server.origin, Cookie: cookie, 'Content-Type': 'application/json' };
    const input = { commandId: 'saved', expectedRevision: 0, commands: [{ type: 'project.update', patch: { title: 'Saved' } }] };
    const post = (body: unknown) => fetch(`${server.origin}/api/commands`, { method: 'POST', headers, body: JSON.stringify(body) });
    expect((await (await post(input)).json()).revision).toBe(1); expect((await (await post(input)).json()).revision).toBe(1);
    const conflict = await post({ ...input, commandId: 'other' }); expect(conflict.status).toBe(409); expect((await conflict.json()).code).toBe('revision-conflict');
    const imported = await fetch(`${server.origin}/api/assets`, { method: 'POST', headers, body: JSON.stringify({ commandId: 'file', expectedRevision: 1, name: 'a.svg', mimeType: 'image/svg+xml', bytesBase64: Buffer.from('<svg/>').toString('base64'), origin: { kind: 'manual' } }) }); const result = await imported.json(); expect(result.ack.revision).toBe(2);
    const asset = await fetch(`${server.origin}/api/assets/${result.asset.id}`, { headers: { Cookie: cookie } }); expect(await asset.text()).toBe('<svg/>');
    expect((await fetch(`${server.origin}/api/snapshot?revision=1`, { headers: { Cookie: cookie } })).status).toBe(200);
    const portable = await fetch(`${server.origin}/api/portable?revision=2`, { headers: { Cookie: cookie } }); expect(portable.headers.get('content-type')).toBe('application/zip');
    const reopened = await startLocalServer({ folder: server.folder, port: 0 }); cleanups.push(() => reopened.close()); expect(reopened.origin).not.toBe(server.origin);
    const newCookie = await login(reopened); const load = await fetch(`${reopened.origin}/api/project`, { headers: { Cookie: newCookie } }); expect(await load.json()).toMatchObject({ title: 'Saved', revision: 2 });
  });
});

it('rejects encoded traversal before URL normalization and does not serve symlinked static files', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-boundary-')); cleanups.push(() => fs.rm(folder, { recursive: true, force: true }));
  const staticDir = path.join(folder, 'static'); await fs.mkdir(staticDir); await fs.writeFile(path.join(staticDir, 'index.html'), '<title>Studio</title>'); await fs.symlink('/etc/hosts', path.join(staticDir, 'escaped.txt'));
  const server = await startLocalServer({ folder: path.join(folder, 'project'), staticDir }); cleanups.push(() => server.close());
  expect((await fetch(server.origin)).status).toBe(200); expect((await fetch(`${server.origin}/escaped.txt`)).status).toBe(403);
  const status = await new Promise<number>(resolve => { const url = new URL(server.origin); const req = http.get({ hostname: url.hostname, port: url.port, path: '/%2e%2e/project.marquio.json' }, res => { res.resume(); resolve(res.statusCode!); }); req.on('error', () => resolve(0)); }); expect(status).toBe(403);
});

it('recognizes an asset retry across the HTTP and direct repository interfaces', async () => {
  const server = await setup(); const cookie = await login(server); const bytes = new Uint8Array([4, 5]);
  const input = { name: 'same.png', mimeType: 'image/png', bytes, origin: { kind: 'manual' as const } }; const batch = { commandId: 'cross-interface', expectedRevision: 0 };
  const response = await fetch(`${server.origin}/api/assets`, { method: 'POST', headers: { Origin: server.origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...batch, ...input, bytes: undefined, bytesBase64: Buffer.from(bytes).toString('base64') }) });
  expect(response.status).toBe(200); const result = await response.json();
  expect(await server.repository.importAsset(input, batch)).toEqual(result);
});

it('returns an explicit error when a portable export asks for an unretained revision', async () => {
  const server = await setup(); const cookie = await login(server);
  const response = await fetch(`${server.origin}/api/portable?revision=99`, { headers: { Cookie: cookie } });
  expect(response.status).toBe(404); expect((await response.json()).code).toBe('revision-not-found');
});
