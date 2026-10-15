import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createProject } from '../../src/core/project';
import { startLocalServer } from '../../src/server/server';
import { connectLocalProject, LocalApiError } from '../../src/server/client';
// Break caught: a client drops the bootstrap fragment without establishing a session or hides save conflicts.
it('exchanges and clears the fragment, confirms imports and preserves typed conflicts and byte snapshots', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-client-')); const server = await startLocalServer({ folder, project: createProject('Client') });
  try {
    let cookie = ''; let replaced = '';
    const fetchWithCookies: typeof fetch = async (url, init) => { const headers = new Headers(init?.headers); headers.set('Origin', server.origin); if (cookie) headers.set('Cookie', cookie); const response = await fetch(url, { ...init, headers }); const set = response.headers.get('set-cookie'); if (set) cookie = set.split(';')[0]; return response; };
    const client = await connectLocalProject({ location: new URL(server.url), history: { replaceState(_data, _unused, url) { replaced = String(url); } }, fetch: fetchWithCookies });
    expect(replaced).toBe(`${server.origin}/`); expect((await client.getProject()).title).toBe('Client');
    const pending = { commandId: 'edit', expectedRevision: 0, commands: [{ type: 'project.update' as const, patch: { title: 'Edited' } }] };
    expect((await client.commit(pending)).revision).toBe(1);
    try { await client.commit({ ...pending, commandId: 'stale' }); throw new Error('Conflict missing'); } catch (error) { expect(error).toBeInstanceOf(LocalApiError); expect(error).toMatchObject({ status: 409, code: 'revision-conflict', currentRevision: 1 }); }
    expect(pending.expectedRevision).toBe(0);
    const result = await client.importAsset({ name: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2]), origin: { kind: 'manual' } }, { commandId: 'asset', expectedRevision: 1 }); expect(result.ack.revision).toBe(2);
    expect(client.assetUrl(result.asset.id)).toBe(`${server.origin}/api/assets/${result.asset.id}`);
    const snapshot = await client.snapshot(2); expect([...snapshot.assets[result.asset.path]]).toEqual([1, 2]);
    expect([...(await client.portable(2)).slice(0, 2)]).toEqual([80, 75]);
  } finally { await server.close(); await fs.rm(folder, { recursive: true }); }
});
