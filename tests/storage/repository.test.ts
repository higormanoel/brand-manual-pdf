import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../../src/core/project';
import { ProjectRepository } from '../../src/storage/repository';
const folders: string[] = [];
async function folder() { const p = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-storage-')); folders.push(p); return p; }
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(folders.splice(0).map(p => fs.rm(p, { recursive: true, force: true }))); });
const batch = (commandId: string, expectedRevision: number, title: string) => ({ commandId, expectedRevision, commands: [{ type: 'project.update' as const, patch: { title } }] });
describe('durable repository', () => {
  it('serializes clients, rejects same-revision edits and retries the exact persisted receipt after reopening', async () => {
    const dir = await folder(); const a = await ProjectRepository.open(dir, { project: createProject('Before') }); const b = await ProjectRepository.open(dir);
    const results = await Promise.allSettled([a.commit(batch('a', 0, 'First')), b.commit(batch('b', 0, 'Second'))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'revision-conflict', currentRevision: 1 });
    const won = (results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof a.commit>>>).value;
    const reopened = await ProjectRepository.open(dir);
    expect(await reopened.commit(batch(won.commandId, 0, won.project.title))).toEqual(won);
    await reopened.commit(batch('next', 1, 'Later'));
    expect(await reopened.commit(batch(won.commandId, 0, won.project.title))).toEqual(won);
    await expect(reopened.commit(batch(won.commandId, 0, 'Other payload'))).rejects.toMatchObject({ code: 'command-id-reused' });
    expect((await b.load()).title).toBe('Later');
  });
  it('retains previous revisions and returns immutable snapshots isolated from byte mutations', async () => {
    const repo = await ProjectRepository.open(await folder(), { project: createProject('Before') });
    const original = new Uint8Array([1, 2, 3]);
    const imported = await repo.importAsset({ name: 'font.woff2', mimeType: 'font/woff2', bytes: original, origin: { kind: 'manual' } }, { commandId: 'asset', expectedRevision: 0 });
    original[0] = 99;
    expect(imported.ack.revision).toBe(1);
    await repo.commit(batch('rename', 1, 'After'));
    const snapshot = await repo.snapshot(1);
    expect(snapshot.project.title).toBe('Before'); expect(Object.isFrozen(snapshot.project)).toBe(true);
    const bytes = snapshot.assets[imported.asset.path]; expect([...bytes]).toEqual([1, 2, 3]); bytes[0] = 88;
    expect([...snapshot.assets[imported.asset.path]]).toEqual([1, 2, 3]);
    expect((await repo.snapshot(0)).project.assets).toHaveLength(0);
  });
  it('reopens a valid prior document when atomic rename fails and permits a later retry', async () => {
    const dir = await folder(); const repo = await ProjectRepository.open(dir, { project: createProject('Before') });
    const rename = fs.rename.bind(fs); vi.spyOn(fs, 'rename').mockImplementation(async (source, target) => { if (String(target).endsWith('project.marquio.json')) throw new Error('disk failure'); await rename(source, target); });
    await expect(repo.commit(batch('write', 0, 'After'))).rejects.toThrow('disk failure'); vi.restoreAllMocks();
    const reopened = await ProjectRepository.open(dir); expect((await reopened.load()).title).toBe('Before');
    expect((await reopened.commit(batch('write', 0, 'After'))).revision).toBe(1);
  });
  it('rejects assets missing on disk, corrupt bytes and symlink escapes', async () => {
    const dir = await folder(); const repo = await ProjectRepository.open(dir, { project: createProject('Before') });
    const { asset } = await repo.importAsset({ name: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([5]), origin: { kind: 'manual' } }, { commandId: 'asset', expectedRevision: 0 });
    await fs.writeFile(path.join(dir, asset.path), new Uint8Array([6]));
    await expect(repo.load()).rejects.toThrow(/hash|integrity/i);
    await fs.rm(path.join(dir, asset.path)); await fs.symlink('/etc/hosts', path.join(dir, asset.path));
    await expect(repo.load()).rejects.toThrow(/symlink/i);
  });
  it('rejects malformed and unknown commands without advancing revision', async () => {
    const repo = await ProjectRepository.open(await folder(), { project: createProject('Before') });
    await expect(repo.commit({ commandId: 'bad', expectedRevision: 0, commands: [{ type: 'unknown' }] } as never)).rejects.toThrow();
    await expect(repo.commit({ commandId: '', expectedRevision: 0, commands: [] })).rejects.toThrow();
    expect((await repo.load()).revision).toBe(0);
  });
});

// Break caught: a per-instance/in-process mutex lets a CLI process overwrite a Studio process.
it('coordinates independently running processes writing the same folder', async () => {
  const { build } = await import('esbuild'); const { spawn } = await import('node:child_process');
  const dir = await folder(); await ProjectRepository.open(dir, { project: createProject('Concurrent') });
  const worker = path.join(dir, 'writer.cjs');
  await build({ stdin: { contents: `import { ProjectRepository } from './src/storage/repository';
const repo = await ProjectRepository.open(process.argv[2]);
try { const ack = await repo.commit({commandId:process.argv[3],expectedRevision:0,commands:[{type:'project.update',patch:{title:process.argv[3]}}]}); console.log(JSON.stringify({revision:ack.revision})); }
catch (error) { console.log(JSON.stringify({code:error.code})); }`, resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  // ESM output keeps top-level await; the child suffix tells Node how to load it.
  const esmWorker = path.join(dir, 'writer.mjs'); await fs.rename(worker, esmWorker);
  const run = (id: string) => new Promise<string>((resolve, reject) => { const child = spawn(process.execPath, [esmWorker, dir, id]); let output = ''; let errors = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { errors += bytes; }); child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(errors))); child.on('error', reject); });
  const results = (await Promise.all([run('cli'), run('studio')])).map(value => JSON.parse(value));
  expect(results.filter(result => result.revision === 1)).toHaveLength(1); expect(results.filter(result => result.code === 'revision-conflict')).toHaveLength(1);
  expect((await (await ProjectRepository.open(dir)).load()).revision).toBe(1);
});

it('keeps manually edited pages recoverable before explicit variant replacement', async () => {
  const project = createProject('Recoverable'); project.pages = [{ id: 'manual-page', sectionId: project.sections[0].id, title: 'Manual edit', width: 1920, height: 1080, background: '#FFFFFF', nodes: [] }];
  const dir = await folder(); const repo = await ProjectRepository.open(dir, { project });
  await repo.commit({ commandId: 'replace', expectedRevision: 0, commands: [{ type: 'variant.install', mode: 'replace', expectedPages: project.pages, pages: [{ ...project.pages[0], id: 'generated-page', title: 'Regenerated' }] }] });
  const reopened = await ProjectRepository.open(dir);
  expect((await reopened.load()).pages[0].title).toBe('Regenerated'); expect((await reopened.snapshot(0)).project.pages[0].title).toBe('Manual edit');
});
