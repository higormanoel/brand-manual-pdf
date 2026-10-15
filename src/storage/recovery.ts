import { z } from 'zod';
import { parseProject, type BrandProject } from '../core/project';
import type { CommandBatch } from '../core/commands';
export const RECOVERY_VERSION = 1;
export const RECOVERY_SCOPE_NOTICE = 'A recuperação do navegador pertence à origem atual, incluindo a porta. Ao reabrir em outra porta, o arquivo confirmado no disco é a fonte de verdade; use um backup portátil para transferir dados que só existem no navegador.';
export interface RecoveryInput { project: BrandProject; assets: Record<string, Uint8Array>; pending: CommandBatch[]; confirmedRevision: number | null; mode: 'local' | 'browser-only' }
export interface RecoveryRecord extends RecoveryInput { version: 1; status: 'pending' | 'disk-confirmed' | 'browser-only'; updatedAt: string }
const batchSchema = z.object({ commandId: z.string().min(1).max(200), expectedRevision: z.number().int().nonnegative(), commands: z.array(z.object({ type: z.string().min(1) }).passthrough()) });
function normalize(input: RecoveryInput): RecoveryInput {
  const project = parseProject(input.project); const mode = z.enum(['local', 'browser-only']).parse(input.mode);
  const confirmedRevision = z.number().int().nonnegative().nullable().parse(input.confirmedRevision);
  if (confirmedRevision !== null && confirmedRevision > project.revision) throw new Error('Confirmed revision exceeds the local project revision');
  const pending = z.array(batchSchema).parse(input.pending) as CommandBatch[];
  const assets: Record<string, Uint8Array> = Object.create(null); let total = 0;
  for (const [name, value] of Object.entries(input.assets)) {
    if (!(value instanceof Uint8Array) || value.length > 32 * 1024 * 1024 || (total += value.length) > 128 * 1024 * 1024) throw new Error('Recovery asset size limit exceeded');
    assets[name] = new Uint8Array(value);
  }
  for (const asset of project.assets) if (!Object.hasOwn(assets, asset.path)) throw new Error(`Missing recovery asset bytes: ${asset.path}`);
  return { project, mode, confirmedRevision, pending, assets };
}
function key(id: string) { return `project:${id}:schema:${RECOVERY_VERSION}`; }
/** IndexedDB is an origin-local recovery cache; successful disk acknowledgments remain authoritative. */
export class RecoveryStore {
  private constructor(private readonly database: IDBDatabase) {}
  static async open(options: { indexedDB?: IDBFactory; name?: string } = {}): Promise<RecoveryStore> {
    const factory = options.indexedDB ?? globalThis.indexedDB; if (!factory) throw new Error('IndexedDB is unavailable; export a portable backup');
    return new Promise((resolve, reject) => {
      const request = factory.open(options.name ?? 'marquio-recovery-v1', RECOVERY_VERSION);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('projects')) request.result.createObjectStore('projects'); };
      request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('Recovery database upgrade blocked'));
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(new RecoveryStore(request.result)); };
    });
  }
  private transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction('projects', mode); const request = action(transaction.objectStore('projects'));
      transaction.oncomplete = () => resolve(request.result); transaction.onerror = () => reject(transaction.error ?? request.error); transaction.onabort = () => reject(transaction.error ?? new Error('Recovery transaction aborted'));
    });
  }
  async save(input: RecoveryInput): Promise<RecoveryRecord> {
    const normalized = normalize(input);
    const status = normalized.mode === 'browser-only' ? 'browser-only' : normalized.pending.length || normalized.confirmedRevision !== normalized.project.revision ? 'pending' : 'disk-confirmed';
    const record: RecoveryRecord = { ...normalized, version: RECOVERY_VERSION, status, updatedAt: new Date().toISOString() };
    await this.transaction('readwrite', store => store.put(record, key(record.project.id))); return structuredClone(record);
  }
  async load(id: string): Promise<RecoveryRecord | undefined> {
    const record = await this.transaction<RecoveryRecord | undefined>('readonly', store => store.get(key(id)));
    if (!record) return undefined;
    if (record.version !== RECOVERY_VERSION) throw new Error('Unsupported recovery version');
    const normalized = normalize(record); if (normalized.project.id !== id) throw new Error('Recovery project ID mismatch');
    const status = normalized.mode === 'browser-only' ? 'browser-only' : normalized.pending.length || normalized.confirmedRevision !== normalized.project.revision ? 'pending' : 'disk-confirmed';
    return { ...normalized, version: RECOVERY_VERSION, status, updatedAt: record.updatedAt };
  }
  async clear(id: string): Promise<void> { await this.transaction('readwrite', store => store.delete(key(id))); }
  close(): void { this.database.close(); }
}
