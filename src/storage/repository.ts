import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { applyCommands, type CommandBatch, type SaveAck } from '../core/commands';
import { createProject, parseProject, type BrandProject } from '../core/project';
import { assetRecordSchema, relativeAssetPathSchema, type AssetImportInput, type AssetRecord } from '../core/assets';
import { createSnapshot, validateAssetStoragePath, validateProjectLayout, MAX_ASSET_BYTES, MAX_PROJECT_BYTES, MAX_STATE_BYTES, type ProjectSnapshot } from './snapshot';
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
function isExists(error: unknown) { return (error as NodeJS.ErrnoException).code === 'EEXIST'; }
async function safePath(folder: string, relative: string): Promise<string> {
  relativeAssetPathSchema.parse(relative); let current = folder;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Symlink paths are not allowed: ${relative}`); } catch (error) { if (!isMissing(error)) throw error; }
  }
  return current;
}
async function syncDirectory(directory: string) { const handle = await fs.open(directory, 'r'); try { await handle.sync(); } finally { await handle.close(); } }
async function readBounded(file: string, limit: number): Promise<Uint8Array> {
  const stat = await fs.stat(file); if (!stat.isFile() || stat.size > limit) throw new Error('File size limit exceeded'); return new Uint8Array(await fs.readFile(file));
}
function serializeState(state: State): string {
  validateProjectLayout(state.project); const json = JSON.stringify(state);
  if (Buffer.byteLength(json) > MAX_STATE_BYTES) throw new Error('Project state size limit exceeded'); return json;
}
export interface RepositoryOptions { project?: BrandProject; snapshot?: ProjectSnapshot }
/** Immutable state files are published by atomic exclusive hard links, never by reclaimable PID locks. */
export class ProjectRepository {
  private constructor(public readonly folder: string) {}
  static async open(folder: string, options: RepositoryOptions = {}): Promise<ProjectRepository> {
    // Capture and validate initialization inputs before any asynchronous work or asset writes.
    const project = parseProject(options.snapshot?.project ?? options.project ?? createProject('Novo projeto'));
    validateProjectLayout(project);
    if (options.snapshot && options.snapshot.revision !== project.revision) throw new Error('Snapshot revision mismatch');
    const snapshot = options.snapshot ? await createSnapshot(project, options.snapshot.assets) : undefined;
    const initial: State = { storageVersion: 1, project, receipts: [] }; const serialized = serializeState(initial);
    await fs.mkdir(folder, { recursive: true }); const repo = new ProjectRepository(await fs.realpath(folder));
    await syncDirectory(path.dirname(repo.folder));
    try { await repo.readState(); return repo; } catch (error) { if (!isMissing(error)) throw error; }
    // A missing base beside committed states is corruption, not an invitation to reset a project.
    try { if ((await fs.readdir(await safePath(repo.folder, 'commits'))).some(name => /^\d+\.json$/.test(name))) throw new Error('Missing project base state'); } catch (error) { if (!isMissing(error)) throw error; }
    if (snapshot) for (const asset of project.assets) await repo.storeBytes(asset.path, snapshot.assets[asset.path]);
    await repo.validateAssets(project);
    try { await repo.publish('project.marquio.json', serialized); } catch (error) { if (!isExists(error)) throw error; await repo.readState(); }
    return repo;
  }
  private async ensureDirectory(directory: string): Promise<void> {
    await fs.mkdir(directory, { recursive: true });
    // Persist each created ancestor entry, including nested portable asset directories.
    for (let current = directory; ; current = path.dirname(current)) { await syncDirectory(current); if (current === this.folder) break; }
  }
  /** Own temporary names are cleaned up; no shared lock or committed pathname is ever removed. */
  private async publish(relative: string, bytes: Uint8Array | string): Promise<void> {
    const target = await safePath(this.folder, relative); const temporaryDirectory = await safePath(this.folder, '.marquio-tmp');
    await this.ensureDirectory(temporaryDirectory);
    const temporary = path.join(temporaryDirectory, randomUUID());
    try {
      const handle = await fs.open(temporary, 'wx', 0o600); try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await fs.link(temporary, target); await syncDirectory(path.dirname(target));
    } finally { await fs.rm(temporary, { force: true }); }
  }
  private async readEnvelope(relative: string): Promise<State> {
    const input = JSON.parse(new TextDecoder().decode(await readBounded(await safePath(this.folder, relative), MAX_STATE_BYTES)));
    const state = stateSchema.parse(input); const project = parseProject(state.project); validateProjectLayout(project);
    if (new Set(state.receipts.map(r => r.commandId)).size !== state.receipts.length || state.receipts.some(r => r.revision > project.revision)) throw new Error('Invalid command receipts');
    return { storageVersion: 1, project, receipts: state.receipts };
  }
  private async readState(): Promise<State> {
    const base = await this.readEnvelope('project.marquio.json'); await syncDirectory(this.folder); let names: string[];
    try { const directory = await safePath(this.folder, 'commits'); names = await fs.readdir(directory);
      // A retry may observe a link before its original publisher reaches fsync; readers confirm it too.
      await syncDirectory(directory); } catch (error) { if (isMissing(error)) return base; throw error; }
    const revisions = names.filter(name => /^\d+\.json$/.test(name)).map(name => Number(name.slice(0, -5))).sort((a, b) => a - b);
    if (!revisions.length) return base;
    for (let index = 0; index < revisions.length; index++) if (revisions[index] !== base.project.revision + index + 1) throw new Error('Noncontiguous committed revisions');
    const revision = revisions[revisions.length - 1]; const state = await this.readEnvelope(`commits/${revision}.json`);
    if (state.project.revision !== revision) throw new Error('Revision integrity mismatch'); return state;
  }
  private async readRevision(revision: number, state: State): Promise<BrandProject> {
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid revision');
    if (revision === state.project.revision) return state.project;
    if (revision > state.project.revision) throw new RepositoryError('revision-not-found', 'Revision is not retained');
    try { const archived = await this.readEnvelope(`commits/${revision}.json`); if (archived.project.revision !== revision) throw new Error('Revision integrity mismatch'); return archived.project; } catch (error) { if (!isMissing(error)) throw error; }
    const base = await this.readEnvelope('project.marquio.json'); if (base.project.revision === revision) return base.project;
    try {
      const project = parseProject(JSON.parse(new TextDecoder().decode(await readBounded(await safePath(this.folder, `revisions/${revision}.json`), MAX_PROJECT_BYTES))));
      validateProjectLayout(project); if (project.revision !== revision) throw new Error('Revision integrity mismatch'); return project;
    } catch (error) { if (isMissing(error)) throw new RepositoryError('revision-not-found', 'Revision is not retained'); throw error; }
  }
  private async validateAssets(project: BrandProject): Promise<Record<string, Uint8Array>> {
    validateProjectLayout(project); const bytes: Record<string, Uint8Array> = Object.create(null); const directories = new Set<string>();
    for (const asset of project.assets) {
      try { const target = await safePath(this.folder, asset.path); bytes[asset.path] = await readBounded(target, MAX_ASSET_BYTES); directories.add(path.dirname(target)); }
      catch (error) { if (isMissing(error)) throw new Error(`Missing asset: ${asset.path}`); throw error; }
    }
    await createSnapshot(project, bytes);
    // A referenced asset may have been linked by another publisher that has not flushed its parent yet.
    for (const directory of directories) await syncDirectory(directory);
    return bytes;
  }
  private async storeBytes(relative: string, bytes: Uint8Array) {
    validateAssetStoragePath(relative); const target = await safePath(this.folder, relative); await this.ensureDirectory(path.dirname(target));
    try { await this.publish(relative, bytes); }
    catch (error) { if (!isExists(error)) throw error; const existing = await readBounded(target, MAX_ASSET_BYTES); if (sha256(existing) !== sha256(bytes)) throw new Error('Asset hash integrity mismatch');
      // EEXIST observes the link, not its publisher's later directory fsync. Fence that observation here.
      await syncDirectory(path.dirname(target)); }
  }
  async load(): Promise<BrandProject> { const state = await this.readState(); await this.validateAssets(state.project); return state.project; }
  private async receipt(state: State, commandId: string, fingerprint: string): Promise<SaveAck | undefined> {
    const previous = state.receipts.find(r => r.commandId === commandId); if (!previous) return undefined;
    if (previous.fingerprint !== fingerprint) throw new RepositoryError('command-id-reused', 'This commandId was already used with a different payload', state.project.revision);
    const project = await this.readRevision(previous.revision, state); await this.validateAssets(project); return { commandId, revision: previous.revision, project };
  }
  private async persist(state: State, project: BrandProject, commandId: string, fingerprint: string): Promise<SaveAck> {
    await this.validateAssets(project);
    const next: State = { storageVersion: 1, project, receipts: [...state.receipts, { commandId, fingerprint, revision: project.revision }] }; const serialized = serializeState(next);
    const directory = await safePath(this.folder, 'commits'); await this.ensureDirectory(directory);
    try { await this.publish(`commits/${project.revision}.json`, serialized); }
    catch (error) {
      if (!isExists(error)) throw error;
      const latest = await this.readState(); const previous = await this.receipt(latest, commandId, fingerprint); if (previous) return previous;
      throw new RepositoryError('revision-conflict', 'Project changed; pending edits were not applied', latest.project.revision);
    }
    return { commandId, revision: project.revision, project };
  }
  async commit(batch: CommandBatch): Promise<SaveAck> {
    const metadata = requestSchema.parse(batch); if (!Array.isArray(batch.commands)) throw new Error('Commands must be an array');
    const request: CommandBatch = { ...metadata, commands: structuredClone(batch.commands) }; const fingerprint = sha256(canonical(request));
    const state = await this.readState(); const previous = await this.receipt(state, request.commandId, fingerprint); if (previous) return previous;
    if (request.expectedRevision !== state.project.revision) throw new RepositoryError('revision-conflict', 'Project changed; pending edits were not applied', state.project.revision);
    const project = applyCommands(state.project, request.commands); project.revision = state.project.revision + 1;
    return this.persist(state, project, request.commandId, fingerprint);
  }
  async snapshot(revision: number): Promise<ProjectSnapshot> { const project = await this.readRevision(revision, await this.readState()); return createSnapshot(project, await this.validateAssets(project)); }
  async importAsset(input: AssetImportInput, batch: Pick<CommandBatch, 'commandId' | 'expectedRevision'>): Promise<{ asset: AssetRecord; ack: SaveAck }> {
    const request = requestSchema.parse(batch); if (!(input.bytes instanceof Uint8Array) || input.bytes.length > MAX_ASSET_BYTES) throw new Error('Asset size limit exceeded');
    const bytes = new Uint8Array(input.bytes); const hash = sha256(bytes);
    const asset = assetRecordSchema.parse({ id: `asset-${sha256(`${request.commandId}:${hash}`)}`, name: input.name, mimeType: input.mimeType, origin: input.origin, hash, path: `assets/${hash}` });
    const fingerprint = sha256(canonical({ ...request, kind: 'importAsset', asset }));
    const state = await this.readState(); const previous = await this.receipt(state, request.commandId, fingerprint); if (previous) return { asset, ack: previous };
    if (request.expectedRevision !== state.project.revision) throw new RepositoryError('revision-conflict', 'Project changed; asset was not installed', state.project.revision);
    const project = applyCommands(state.project, [{ type: 'asset.insert', asset }]); project.revision++;
    const currentBytes = await this.validateAssets(state.project); await createSnapshot(project, { ...currentBytes, [asset.path]: bytes });
    await this.storeBytes(asset.path, bytes);
    return { asset, ack: await this.persist(state, project, request.commandId, fingerprint) };
  }
}
