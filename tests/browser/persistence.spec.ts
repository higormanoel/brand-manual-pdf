import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { createProject } from '../../src/core/project';
import { startLocalServer } from '../../src/server/server';

test('disk acknowledgment survives another port while IndexedDB recovery retains origin-local pending bytes', async ({ browser }) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-browser-project-'));
  const staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-browser-client-'));
  await fs.writeFile(path.join(staticDir, 'index.html'), '<!doctype html><title>Persistence integration</title><script type="module" src="/test-client.js"></script>');
  await build({ stdin: { contents: `import {connectLocalProject} from './src/server/client'; import {RecoveryStore} from './src/storage/recovery'; import {exportPortable,importPortable} from './src/storage/portable'; window.backup={exportPortable,importPortable}; window.marquioReady = (async()=>({client:await connectLocalProject(), recovery:await RecoveryStore.open()}))();`, resolveDir: process.cwd() }, outfile: path.join(staticDir, 'test-client.js'), bundle: true, platform: 'browser', format: 'esm', logLevel: 'silent' });
  const first = await startLocalServer({ folder, staticDir, project: createProject('Disk') });
  const context = await browser.newContext(); const page = await context.newPage();
  let second: Awaited<ReturnType<typeof startLocalServer>> | undefined;
  try {
    await page.goto(first.url);
    const saved = await page.evaluate<{ id: string; status: string; path: string }>(`(async()=>{ const {client,recovery}=await window.marquioReady; const project=await client.getProject(); const imported=await client.importAsset({name:'original.png',mimeType:'image/png',bytes:new Uint8Array([1,3,8]),origin:{kind:'manual'}},{commandId:'asset',expectedRevision:0}); const confirmed=imported.ack.project; const snapshot=await client.snapshot(1); const portable=await window.backup.exportPortable(snapshot); const reopened=await window.backup.importPortable(portable); if(reopened.assets[imported.asset.path][1]!==3)throw new Error('Browser portable lost original bytes'); const pending={commandId:'pending',expectedRevision:1,commands:[{type:'project.update',patch:{title:'Unsaved browser edit'}}]}; const record=await recovery.save({project:{...confirmed,title:'Unsaved browser edit'},assets:snapshot.assets,pending:[pending],confirmedRevision:1,mode:'local'}); return {id:project.id,status:record.status,path:imported.asset.path}; })()`);
    expect(saved.status).toBe('pending'); expect(page.url()).toBe(`${first.origin}/`);
    const old = await page.evaluate(`(async()=>{const {recovery}=await window.marquioReady;const record=await recovery.load(${JSON.stringify(saved.id)});return {title:record.project.title,bytes:[...record.assets[${JSON.stringify(saved.path)}]],pending:record.pending.length};})()`);
    expect(old).toEqual({ title: 'Unsaved browser edit', bytes: [1, 3, 8], pending: 1 });
    second = await startLocalServer({ folder, staticDir }); expect(second.origin).not.toBe(first.origin);
    const next = await context.newPage(); await next.goto(second.url);
    const reopened = await next.evaluate(`(async()=>{const {client,recovery}=await window.marquioReady;const project=await client.getProject();return {title:project.title,revision:project.revision,recovered:await recovery.load(project.id)};})()`);
    expect(reopened).toEqual({ title: 'Disk', revision: 1, recovered: undefined });
    // Closing/reopening the old document in the same origin keeps its pending cache.
    await page.reload();
    expect(await page.evaluate(`(async()=>{const {recovery}=await window.marquioReady;return (await recovery.load(${JSON.stringify(saved.id)})).pending.length;})()`)).toBe(1);
  } finally { await context.close(); await first.close(); await second?.close(); await fs.rm(folder, { recursive: true }); await fs.rm(staticDir, { recursive: true }); }
});
