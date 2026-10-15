import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { applyCommands, type CommandBatch, type SaveAck } from '../core/commands';
import { createProject, parseProject, type BrandProject } from '../core/project';
import { assetRecordSchema, relativeAssetPathSchema, type AssetImportInput, type AssetRecord } from '../core/assets';
import { createSnapshot, validateAssetStoragePath, MAX_ASSET_BYTES, MAX_PROJECT_BYTES, type ProjectSnapshot } from './snapshot';
export type { ProjectSnapshot } from './snapshot';
function sha256(bytes: Uint8Array | string): string { return createHash('sha256').update(bytes).digest('hex'); }
const requestSchema = z.object({ commandId: z.string().min(1).max(200), expectedRevision: z.number().int().nonnegative() });
interface Receipt { commandId: string; fingerprint: string; revision: number }
interface State { storageVersion: 1; project: BrandProject; receipts: Receipt[] }
const receiptSchema = z.object({ commandId: z.string(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().nonnegative() });
const stateSchema = z.object({ storageVersion: z.literal(1), project: z.unknown(), receipts: z.array(receiptSchema) });
export class RepositoryError extends Error {
  constructor(public readonly code: string, message: string, public readonly currentRevision?: number) { super(message); this.name = 'RepositoryError'; }
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') { const result = JSON.stringify(value); if (result === undefined) throw new Error('Invalid JSON command'); return result; }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
function isMissing(error: unknown) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
/** Reject every symbolic component, including the final file, before touching project-owned paths. */
async function safePath(folder: string, relative: string): Promise<string> {
  relativeAssetPathSchema.parse(relative); let current = folder;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Symlink paths are not allowed: ${relative}`); } catch (error) { if (!isMissing(error)) throw error; }
  }
  return current;
}
async function syncDirectory(directory: string) { const handle = await fs.open(directory, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function atomicWrite(target: string, bytes: Uint8Array | string) {
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temp, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp, target); await syncDirectory(path.dirname(target));
  } finally { await fs.rm(temp, { force: true }); }
}
async function readBounded(file: string, limit: number): Promise<Uint8Array> {
  const stat = await fs.stat(file); if (!stat.isFile() || stat.size > limit) throw new Error('File size limit exceeded'); return new Uint8Array(await fs.readFile(file));
}
export interface RepositoryOptions { project?: BrandProject; snapshot?: ProjectSnapshot }
export class ProjectRepository {
  private constructor(public readonly folder: string) {}
  static async open(folder: string, options: RepositoryOptions = {}): Promise<ProjectRepository> {
    await fs.mkdir(folder, { recursive: true }); const repo = new ProjectRepository(await fs.realpath(folder));
    await repo.withLock(async () => {
      try { await repo.readState(); } catch (error) {
        if (!isMissing(error)) throw error;
        const project = options.snapshot ? parseProject(options.snapshot.project) : parseProject(options.project ?? createProject('Novo projeto'));
        if (options.snapshot && options.snapshot.revision !== project.revision) throw new Error('Snapshot revision mismatch');
        if (options.snapshot) {
          const snapshot = await createSnapshot(project, options.snapshot.assets);
          for (const asset of project.assets) await repo.storeBytes(asset.path, snapshot.assets[asset.path]);
        }
        await repo.validateAssets(project);
        await atomicWrite(await safePath(repo.folder, 'project.marquio.json'), JSON.stringify({ storageVersion: 1, project, receipts: [] }));
      }
    }); return repo;
  }
  private async withLock<T>(action: () => Promise<T>): Promise<T> {
    const lock = await safePath(this.folder, '.marquio-write-lock'); const start = Date.now();
    for (;;) {
      try { await fs.mkdir(lock); break; } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        // A dead process cannot release its lock. Never steal from a live process.
        try {
          const ownerPath = await safePath(this.folder, '.marquio-write-lock/owner.json');
          const owner = JSON.parse(await fs.readFile(ownerPath, 'utf8')) as { pid: number };
          if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('Invalid lock owner');
          try { process.kill(owner.pid, 0); } catch (failure) { if ((failure as NodeJS.ErrnoException).code === 'ESRCH') { await fs.rm(lock, { recursive: true }); continue; } throw failure; }
        } catch (failure) {
          if (isMissing(failure) && Date.now() - (await fs.stat(lock)).mtimeMs > 30_000) { await fs.rm(lock, { recursive: true }); continue; }
          if (!isMissing(failure)) throw failure;
        }
        if (Date.now() - start > 10_000) throw new RepositoryError('project-busy', 'Another process is writing this project');
        await new Promise(resolve => setTimeout(resolve, 15));
      }
    }
    try { await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 }); return await action(); }
    finally { await fs.rm(lock, { recursive: true, force: true }); }
  }
  private async readState(): Promise<State> {
    const input = JSON.parse(new TextDecoder().decode(await readBounded(await safePath(this.folder, 'project.marquio.json'), MAX_PROJECT_BYTES * 4)));
    const state = stateSchema.parse(input); const project = parseProject(state.project);
    if (new Set(state.receipts.map(r => r.commandId)).size !== state.receipts.length || state.receipts.some(r => r.revision > project.revision)) throw new Error('Invalid command receipts');
    return { storageVersion: 1, project, receipts: state.receipts };
  }
  private async readRevision(revision: number, state: State): Promise<BrandProject> {
    if (!Number.isInteger(revision) || revision < 0) throw new Error('Invalid revision');
    if (revision === state.project.revision) return state.project;
    try {
      const project = parseProject(JSON.parse(new TextDecoder().decode(await readBounded(await safePath(this.folder, `revisions/${revision}.json`), MAX_PROJECT_BYTES))));
      if (project.revision !== revision) throw new Error('Revision integrity mismatch'); return project;
    } catch (error) { if (isMissing(error)) throw new RepositoryError('revision-not-found', 'Revision is not retained'); throw error; }
  }
  private async validateAssets(project: BrandProject): Promise<Record<string, Uint8Array>> {
    const bytes: Record<string, Uint8Array> = Object.create(null);
    for (const asset of project.assets) {
      validateAssetStoragePath(asset.path);
      try { bytes[asset.path] = await readBounded(await safePath(this.folder, asset.path), MAX_ASSET_BYTES); }
      catch (error) { if (isMissing(error)) throw new Error(`Missing asset: ${asset.path}`); throw error; }
    }
    await createSnapshot(project, bytes); return bytes;
  }
  private async storeBytes(relative: string, bytes: Uint8Array) {
    // Restored manifests retain safe relative paths; new imports use content hashes.
    validateAssetStoragePath(relative);
    const target = await safePath(this.folder, relative); await fs.mkdir(path.dirname(target), { recursive: true });
    try { const existing = await readBounded(target, MAX_ASSET_BYTES); if (sha256(existing) !== sha256(bytes)) throw new Error('Asset hash integrity mismatch'); }
    catch (error) { if (!isMissing(error)) throw error; await atomicWrite(target, bytes); }
  }
  async load(): Promise<BrandProject> { const state = await this.readState(); await this.validateAssets(state.project); return state.project; }
  private async receipt(state: State, commandId: string, fingerprint: string): Promise<SaveAck | undefined> {
    const previous = state.receipts.find(r => r.commandId === commandId); if (!previous) return undefined;
    if (previous.fingerprint !== fingerprint) throw new RepositoryError('command-id-reused', 'This commandId was already used with a different payload', state.project.revision);
    const project = await this.readRevision(previous.revision, state); await this.validateAssets(project); return { commandId, revision: previous.revision, project };
  }
  private async persist(state: State, project: BrandProject, commandId: string, fingerprint: string): Promise<SaveAck> {
    await this.validateAssets(project);
    await fs.mkdir(await safePath(this.folder, 'revisions'), { recursive: true });
    const oldFile = await safePath(this.folder, `revisions/${state.project.revision}.json`);
    // Persist recovery before replacing the currently confirmed revision.
    await atomicWrite(oldFile, JSON.stringify(state.project));
    const next: State = { storageVersion: 1, project, receipts: [...state.receipts, { commandId, fingerprint, revision: project.revision }] };
    const json = JSON.stringify(next); if (Buffer.byteLength(json) > MAX_PROJECT_BYTES * 4) throw new Error('Project state size limit exceeded');
    await atomicWrite(await safePath(this.folder, 'project.marquio.json'), json);
    return { commandId, revision: project.revision, project };
  }
  async commit(batch: CommandBatch): Promise<SaveAck> {
    const request = requestSchema.parse(batch); if (!Array.isArray(batch.commands)) throw new Error('Commands must be an array');
    const fingerprint = sha256(canonical({ ...request, commands: batch.commands }));
    return this.withLock(async () => {
      const state = await this.readState(); const previous = await this.receipt(state, batch.commandId, fingerprint); if (previous) return previous;
      if (batch.expectedRevision !== state.project.revision) throw new RepositoryError('revision-conflict', 'Project changed; pending edits were not applied', state.project.revision);
      const project = applyCommands(state.project, batch.commands); project.revision = state.project.revision + 1;
      return this.persist(state, project, batch.commandId, fingerprint);
    });
  }
  async snapshot(revision: number): Promise<ProjectSnapshot> {
    // Reading an archived immutable revision never changes when a new writer commits.
    return this.withLock(async () => { const project = await this.readRevision(revision, await this.readState()); return createSnapshot(project, await this.validateAssets(project)); });
  }
  async importAsset(input: AssetImportInput, batch: Pick<CommandBatch, 'commandId' | 'expectedRevision'>): Promise<{ asset: AssetRecord; ack: SaveAck }> {
    const request = requestSchema.parse(batch); if (!(input.bytes instanceof Uint8Array) || input.bytes.length > MAX_ASSET_BYTES) throw new Error('Asset size limit exceeded');
    const bytes = new Uint8Array(input.bytes); const hash = sha256(bytes);
    const asset = assetRecordSchema.parse({ id: `asset-${sha256(`${batch.commandId}:${hash}`)}`, name: input.name, mimeType: input.mimeType, origin: input.origin, hash, path: `assets/${hash}` });
    const fingerprint = sha256(canonical({ ...request, kind: 'importAsset', asset }));
    return this.withLock(async () => {
      const state = await this.readState(); const previous = await this.receipt(state, batch.commandId, fingerprint); if (previous) return { asset, ack: previous };
      if (batch.expectedRevision !== state.project.revision) throw new RepositoryError('revision-conflict', 'Project changed; asset was not installed', state.project.revision);
      await this.storeBytes(asset.path, bytes);
      const project = applyCommands(state.project, [{ type: 'asset.insert', asset }]); project.revision++;
      return { asset, ack: await this.persist(state, project, batch.commandId, fingerprint) };
    });
  }
}
