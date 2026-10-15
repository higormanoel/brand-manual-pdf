import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createProject } from '../../src/core/project';
import { ProjectRepository } from '../../src/storage/repository';
import { createSnapshot, MAX_PROJECT_BYTES } from '../../src/storage/snapshot';
import { exportPortable, importPortable } from '../../src/storage/portable';
const folders: string[] = [];
async function folder() { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-review-')); folders.push(dir); return dir; }
afterEach(async () => { await Promise.all(folders.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true }))); });
const batch = (title: string) => ({ commandId: 'original', expectedRevision: 0, commands: [{ type: 'project.update' as const, patch: { title } }] });
function asset(id: string, assetPath: string, bytes = new Uint8Array([1, 2, 3])) { return { id, path: assetPath, name: id, mimeType: 'image/png', hash: createHash('sha256').update(bytes).digest('hex'), origin: { kind: 'manual' as const } }; }

it('captures commands and receipt metadata synchronously before callers can mutate pending requests', async () => {
  const repo = await ProjectRepository.open(await folder(), { project: createProject('Before') });
  const request = batch('Original'); const expected = structuredClone(request); const pending = repo.commit(request);
  request.commandId = 'mutated'; request.expectedRevision = 99; request.commands[0].patch.title = 'Mutated';
  const ack = await pending; expect(ack).toMatchObject({ commandId: 'original', revision: 1, project: { title: 'Original' } });
  expect(await repo.commit(expected)).toEqual(ack);
  const metadata = { commandId: 'asset', expectedRevision: 1 }; const original = { name: 'original.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]), origin: { kind: 'manual' as const } };
  const importing = repo.importAsset(original, metadata); metadata.commandId = 'changed'; metadata.expectedRevision = 999; original.bytes[0] = 9; original.name = 'Changed';
  const imported = await importing; expect(imported.ack.commandId).toBe('asset'); expect(imported.asset.name).toBe('original.png'); expect([...((await repo.snapshot(2)).assets[imported.asset.path])]).toEqual([1, 2, 3]);
});

it('captures every source buffer before the first asynchronous digest', async () => {
  const p = createProject('Snapshot'); const first = new Uint8Array([1, 2, 3]); const second = new Uint8Array([1, 2, 3]);
  p.assets = [asset('one', 'assets/one'), asset('two', 'assets/two')];
  const pending = createSnapshot(p, { 'assets/one': first, 'assets/two': second }); first[0] = 9; second[0] = 8;
  const snapshot = await pending; expect([...snapshot.assets['assets/one']]).toEqual([1, 2, 3]); expect([...snapshot.assets['assets/two']]).toEqual([1, 2, 3]);
});

it.each(['Project.Marquio.json', 'Revisions/old', '.MARQUIO-WRITE-LOCK/owner.json', 'Commits/1.json', '.MARQUIO-TMP/file', 'project.json.', 'assets/a ', 'assets/A/../x'])('rejects filesystem aliases before restoring any asset: %s', async assetPath => {
  const dir = await folder(); const p = createProject('Alias'); p.assets = [asset('one', 'assets/valid-first'), asset('two', assetPath)];
  await expect(ProjectRepository.open(dir, { snapshot: { revision: 0, project: p, assets: { 'assets/valid-first': new Uint8Array([1, 2, 3]), [assetPath]: new Uint8Array([1, 2, 3]) } } })).rejects.toThrow(/path|alias|metadata/i);
  expect(await fs.readdir(dir)).toEqual([]);
});

it.each([['assets/FONT.woff', 'assets/font.woff'], ['assets/café', 'assets/cafe\u0301'], ['assets/file', 'ASSETS/file/child']])('rejects colliding paths under supported filesystem equivalence: %s / %s', async (a, b) => {
  const p = createProject('Collision'); p.assets = [asset('one', a), asset('two', b)];
  await expect(createSnapshot(p, { [a]: new Uint8Array([1, 2, 3]), [b]: new Uint8Array([1, 2, 3]) })).rejects.toThrow(/collision|alias/i);
});

it('rejects documents above the shared serialized bound before initialization or acknowledgment', async () => {
  const dir = await folder(); const p = createProject('Before'); p.title = 'x'.repeat(MAX_PROJECT_BYTES);
  await expect(ProjectRepository.open(dir, { project: p })).rejects.toThrow(/size limit/i); expect(await fs.readdir(dir)).toEqual([]);
  const repo = await ProjectRepository.open(dir, { project: createProject('Small') });
  await expect(repo.commit(batch('x'.repeat(MAX_PROJECT_BYTES)))).rejects.toThrow(/size limit/i);
  expect((await repo.load()).revision).toBe(0);
});

it('roundtrips the exact document size boundary and retains its original receipt after a later commit', async () => {
  const p = createProject('x'); const overhead = Buffer.byteLength(JSON.stringify(p)) - 1; const title = 'x'.repeat(MAX_PROJECT_BYTES - overhead);
  const repo = await ProjectRepository.open(await folder(), { project: p }); const original = batch(title); const ack = await repo.commit(original);
  expect(Buffer.byteLength(JSON.stringify(ack.project))).toBe(MAX_PROJECT_BYTES);
  expect((await importPortable(await exportPortable(await repo.snapshot(1)))).project.title.length).toBe(title.length);
  await repo.commit({ commandId: 'later', expectedRevision: 1, commands: [{ type: 'project.update', patch: { title: 'Small again' } }] });
  const reopened = await ProjectRepository.open(repo.folder); expect((await reopened.snapshot(1)).project.title.length).toBe(title.length); expect(await reopened.commit(original)).toEqual(ack);
});

it('rejects a bundle that exceeds entry bounds before acknowledging initialization or exporting', async () => {
  const p = createProject('Entries'); const bytes = new Uint8Array([1, 2, 3]); const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < 2050; index++) { const name = `assets/${index}`; p.assets.push(asset(`asset-${index}`, name)); files[name] = bytes; }
  const snapshot = { revision: 0, project: p, assets: files }; const dir = await folder();
  await expect(exportPortable(snapshot).then(() => 'exported')).rejects.toThrow(/entry limit/i);
  await expect(ProjectRepository.open(dir, { snapshot })).rejects.toThrow(/entry limit/i); expect(await fs.readdir(dir)).toEqual([]);
});

it('reads a legacy canonical checkpoint and historical projects after append-only commits', async () => {
  const dir = await folder(); const base = createProject('Base'); const current = structuredClone(base); current.title = 'Legacy'; current.revision = 1;
  const request = { commandId: 'legacy', expectedRevision: 0, commands: [{ type: 'project.update' as const, patch: { title: 'Legacy' } }] };
  const fingerprint = createHash('sha256').update('{"commandId":"legacy","commands":[{"patch":{"title":"Legacy"},"type":"project.update"}],"expectedRevision":0}').digest('hex');
  const checkpoint = JSON.stringify({ storageVersion: 1, project: current, receipts: [{ commandId: 'legacy', fingerprint, revision: 1 }] });
  await fs.mkdir(path.join(dir, 'revisions')); await fs.writeFile(path.join(dir, 'revisions/0.json'), JSON.stringify(base)); await fs.writeFile(path.join(dir, 'project.marquio.json'), checkpoint);
  const repo = await ProjectRepository.open(dir); await repo.commit({ commandId: 'next', expectedRevision: 1, commands: [{ type: 'project.update', patch: { title: 'Latest' } }] });
  const reopened = await ProjectRepository.open(dir);
  expect((await reopened.load()).title).toBe('Latest'); expect((await reopened.snapshot(0)).project.title).toBe('Base'); expect((await reopened.snapshot(1)).project.title).toBe('Legacy');
  expect(await reopened.commit(request)).toMatchObject({ commandId: 'legacy', revision: 1, project: { title: 'Legacy' } });
  expect(await fs.readFile(path.join(dir, 'project.marquio.json'), 'utf8')).toBe(checkpoint);
});

it('accepts exactly the entry boundary without generating hidden directory entries', async () => {
  const { MAX_BUNDLE_ENTRIES } = await import('../../src/storage/snapshot'); const { default: JSZip } = await import('jszip');
  const project = createProject('Entry boundary'); const files: Record<string, Uint8Array> = {}; const bytes = new Uint8Array();
  for (let index = 0; index < MAX_BUNDLE_ENTRIES - 1; index++) { const name = `nested/${index}/file`; project.assets.push(asset(`file-${index}`, name, bytes)); files[name] = bytes; }
  const packed = await exportPortable({ project, revision: 0, assets: files }); const zip = await JSZip.loadAsync(packed);
  expect(Object.values(zip.files)).toHaveLength(MAX_BUNDLE_ENTRIES); expect(Object.values(zip.files).every(entry => !entry.dir)).toBe(true);
  expect((await importPortable(packed)).project.assets).toHaveLength(MAX_BUNDLE_ENTRIES - 1);
});

it('counts document and archive overhead in the aggregate byte budget before copying or hashing assets', async () => {
  const { MAX_ASSET_BYTES } = await import('../../src/storage/snapshot'); const bytes = new Uint8Array(MAX_ASSET_BYTES); const project = createProject('Aggregate bound'); const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < 4; index++) { const name = `assets/${index}`; project.assets.push(asset(`file-${index}`, name, bytes)); files[name] = bytes; }
  await expect(createSnapshot(project, files)).rejects.toThrow(/bundle size limit/i);
});

it('retains one idempotent acknowledgment for simultaneous copies of the same command', async () => {
  const repo = await ProjectRepository.open(await folder(), { project: createProject('Before') }); const request = batch('Once');
  const results = await Promise.all([repo.commit(request), repo.commit(request)]); expect(results[0]).toEqual(results[1]); expect((await repo.load()).revision).toBe(1);
});

it('budgets the exact STORE ZIP headers and Unicode fields produced by JSZip', async () => {
  const { storedZipSize } = await import('../../src/storage/snapshot'); const { default: JSZip } = await import('jszip'); const zip = new JSZip();
  zip.file('project.json', '12345', { createFolders: false }); zip.file('assets/café', new Uint8Array([1, 2, 3]), { createFolders: false });
  // 22-byte end record + (76 + 2*12 + 5) + (76 + 2*(12 + 9 + 12) + 3).
  expect(storedZipSize({ 'project.json': 5, 'assets/café': 3 })).toBe(272);
  expect((await zip.generateAsync({ type: 'uint8array', compression: 'STORE' })).length).toBe(272);
});

it('rejects metadata aliases and asset collisions in later commits while retaining the confirmed revision', async () => {
  const repo = await ProjectRepository.open(await folder(), { project: createProject('Protected') });
  const imported = await repo.importAsset({ name: 'image', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]), origin: { kind: 'manual' } }, { commandId: 'image', expectedRevision: 0 });
  await expect(repo.commit({ commandId: 'metadata', expectedRevision: 1, commands: [{ type: 'asset.update', assetId: imported.asset.id, patch: { path: 'Project.Marquio.json' } }] })).rejects.toThrow(/metadata/i);
  await expect(repo.commit({ commandId: 'alias', expectedRevision: 1, commands: [{ type: 'asset.insert', asset: { ...imported.asset, id: 'other-id', path: imported.asset.path.toUpperCase() } }] })).rejects.toThrow(/alias|collision/i);
  expect((await repo.load()).revision).toBe(1); expect((await repo.snapshot(1)).project.assets[0].path).toBe(imported.asset.path);
});

// Run the real 128 MiB boundary in its own process so archive buffers are released independently of the test runner.
it('accounts for __proto__ and roundtrips an accepted exact aggregate boundary', async () => {
  const { build } = await import('esbuild'); const { spawn } = await import('node:child_process'); const dir = await folder(); const worker = path.join(dir, 'boundary.mjs');
  await build({ stdin: { resolveDir: process.cwd(), contents: `import {createHash} from 'node:crypto'; import {createProject} from './src/core/project'; import {createSnapshot,storedZipSize,MAX_ASSET_BYTES,MAX_BUNDLE_BYTES} from './src/storage/snapshot'; import {exportPortable,importPortable} from './src/storage/portable';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'); const project=createProject('Prototype boundary'); const files=Object.create(null); const sizes=Object.create(null); const full=new Uint8Array(MAX_ASSET_BYTES); const empty=new Uint8Array();
for(let i=0;i<4;i++){const path='assets/'+i; files[path]=i<3?full:empty; project.assets.push({id:'asset-'+i,path,name:path,mimeType:'application/octet-stream',hash:hash(files[path]),origin:{kind:'manual'}}); sizes[path]=files[path].length;}
files['__proto__']=empty; sizes['__proto__']=0; project.assets.push({id:'proto',path:'__proto__',name:'proto',mimeType:'application/octet-stream',hash:hash(empty),origin:{kind:'manual'}});
sizes['project.json']=new TextEncoder().encode(JSON.stringify(project)).length; const lastLength=MAX_BUNDLE_BYTES-storedZipSize(sizes); const last=new Uint8Array(lastLength+94); files['assets/3']=last; project.assets[3].hash=hash(last);
let rejected=false;try{await createSnapshot(project,files);}catch(error){if(!/size limit/.test(error.message))throw error;rejected=true;}
if(!rejected){console.log(JSON.stringify({rejectedOversizedProto:false}));process.exit(0);}
files['assets/3']=last.subarray(0,lastLength);project.assets[3].hash=hash(files['assets/3']);const snapshot=await createSnapshot(project,files);const packed=await exportPortable(snapshot);const restored=await importPortable(packed);
console.log(JSON.stringify({rejectedOversizedProto:true,archiveLength:packed.length,prototypeBytes:restored.assets['__proto__'].length,assetCount:restored.project.assets.length,lastLength:restored.assets['assets/3'].length,expectedLastLength:lastLength}));` }, outfile: worker, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  const result = await new Promise<Record<string, unknown>>((resolve, reject) => { const child = spawn(process.execPath, [worker]); let stdout = ''; let stderr = ''; child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(`Boundary process exited ${code}: ${stderr}`))); });
  expect(result).toMatchObject({ rejectedOversizedProto: true, archiveLength: 134217728, prototypeBytes: 0, assetCount: 5 }); expect(result.lastLength).toBe(result.expectedLastLength);
}, 30000);
