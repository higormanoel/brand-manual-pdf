import { z } from 'zod';
import { parseProject, type BrandProject } from '../core/project';
import type { SaveAck, CommandBatch } from '../core/commands';
export const RECOVERY_VERSION = 1;
export const RECOVERY_SCOPE_NOTICE = 'A recuperação do navegador pertence à origem atual, incluindo a porta. Ao reabrir em outra porta, o arquivo confirmado no disco é a fonte de verdade; use um backup portátil para transferir dados que só existem no navegador.';
export interface RecoveryInput { project: BrandProject; assets: Record<string, Uint8Array>; pending: CommandBatch[]; confirmedRevision: number | null; mode: 'local' | 'browser-only' }
export interface RecoveryRecord extends RecoveryInput { version: 1; status: 'pending' | 'disk-confirmed' | 'browser-only'; updatedAt: string }
export interface PublicationReceipt {
  commandId: string;
  expectedRevision: number;
  fingerprint: string;
}
export interface CanonicalPublication {
  record: RecoveryRecord;
  ack?: SaveAck;
}
interface StoredReceipt extends PublicationReceipt {
  project: BrandProject;
}
interface CanonicalRecord extends RecoveryRecord {
  receipts?: Record<string, StoredReceipt>;
}
export class RecoveryPublicationError extends Error {
  constructor(
    public readonly code: "revision-conflict" | "command-id-reused",
    message: string,
    public readonly currentRevision: number,
  ) {
    super(message);
  }
}
const receiptSchema = z.object({
  commandId: z.string().min(1).max(200),
  expectedRevision: z.number().int().nonnegative(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
const LAST_BROWSER_PROJECT = "last-browser-project:v1";
function makeRecord(input: RecoveryInput): RecoveryRecord {
  const normalized = normalize(input);
  return {
    ...normalized,
    version: RECOVERY_VERSION,
    status:
      normalized.mode === "browser-only"
        ? "browser-only"
        : normalized.pending.length ||
            normalized.confirmedRevision !== normalized.project.revision
          ? "pending"
          : "disk-confirmed",
    updatedAt: new Date().toISOString(),
  };
}
function readPublication(
  raw: CanonicalRecord,
  id: string,
  receipt?: PublicationReceipt,
): CanonicalPublication {
  if (raw.version !== RECOVERY_VERSION)
    throw new Error("Unsupported recovery version");
  const record = {
    ...normalize(raw),
    version: RECOVERY_VERSION,
    status: raw.status,
    updatedAt: raw.updatedAt,
  } as RecoveryRecord;
  if (record.project.id !== id)
    throw new Error("Canonical project ID mismatch");
  if (!receipt || !Object.hasOwn(raw.receipts ?? {}, receipt.commandId))
    return { record };
  const stored = raw.receipts![receipt.commandId];
  if (
    stored.fingerprint !== receipt.fingerprint ||
    stored.expectedRevision !== receipt.expectedRevision
  )
    throw new RecoveryPublicationError(
      "command-id-reused",
      "O ID do comando já foi usado com outro conteúdo.",
      record.project.revision,
    );
  const project = parseProject(stored.project);
  if (project.id !== id || project.revision !== receipt.expectedRevision + 1)
    throw new Error("Invalid canonical receipt");
  return {
    record,
    ack: { commandId: receipt.commandId, revision: project.revision, project },
  };
}
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
  /** Atomic canonical publication: compare, project, receipt and discovery index share one transaction. */
  async publish(
    input: RecoveryInput,
    expectedRevision: number | null,
    receiptInput?: PublicationReceipt,
  ): Promise<CanonicalPublication> {
    const record = makeRecord(input);
    const receipt = receiptInput
      ? receiptSchema.parse(receiptInput)
      : undefined;
    if (
      record.mode !== "browser-only" ||
      record.pending.length ||
      record.confirmedRevision !== record.project.revision
    )
      throw new Error(
        "Canonical browser publication requires a confirmed project",
      );
    if (
      expectedRevision !== null &&
      (!Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 0 ||
        !receipt ||
        receipt.expectedRevision !== expectedRevision ||
        record.project.revision !== expectedRevision + 1)
    )
      throw new Error("Invalid canonical publication revision");
    if (expectedRevision === null && receipt)
      throw new Error("Initial publication cannot contain a command receipt");
    return new Promise((resolve, reject) => {
      const tx = this.database.transaction("projects", "readwrite");
      const objects = tx.objectStore("projects");
      const read = objects.get(key(record.project.id));
      let result: CanonicalPublication;
      let failure: unknown;
      read.onsuccess = () => {
        try {
          const current = read.result as CanonicalRecord | undefined;
          if (current) {
            const previous = readPublication(
              current,
              record.project.id,
              receipt,
            );
            if (previous.ack) {
              result = previous;
              return;
            }
            if (expectedRevision === null) {
              if (
                JSON.stringify(previous.record.project) !==
                JSON.stringify(record.project)
              )
                throw new RecoveryPublicationError(
                  "revision-conflict",
                  "Já existe uma versão confirmada deste projeto no navegador.",
                  previous.record.project.revision,
                );
              result = previous;
              objects.put(record.project.id, LAST_BROWSER_PROJECT);
              return;
            }
            if (previous.record.project.revision !== expectedRevision)
              throw new RecoveryPublicationError(
                "revision-conflict",
                "Outra sessão confirmou alterações. Recarregue ou baixe sua recuperação.",
                previous.record.project.revision,
              );
          } else if (expectedRevision !== null)
            throw new RecoveryPublicationError(
              "revision-conflict",
              "O projeto confirmado não está disponível.",
              0,
            );
          const receipts = Object.fromEntries(
            Object.entries(current?.receipts ?? {}),
          );
          if (receipt)
            Object.defineProperty(receipts, receipt.commandId, {
              value: { ...receipt, project: record.project },
              enumerable: true,
              writable: true,
              configurable: true,
            });
          const next: CanonicalRecord = { ...record, receipts };
          objects.put(next, key(record.project.id));
          objects.put(record.project.id, LAST_BROWSER_PROJECT);
          result = {
            record,
            ack: receipt
              ? {
                  commandId: receipt.commandId,
                  revision: record.project.revision,
                  project: structuredClone(record.project),
                }
              : undefined,
          };
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(structuredClone(result));
      tx.onerror = () => reject(failure ?? tx.error ?? read.error);
      tx.onabort = () =>
        reject(
          failure ?? tx.error ?? new Error("Canonical publication aborted"),
        );
    });
  }
  async publication(
    id: string,
    receiptInput?: PublicationReceipt,
  ): Promise<CanonicalPublication | undefined> {
    const receipt = receiptInput
      ? receiptSchema.parse(receiptInput)
      : undefined;
    const raw = await this.transaction<CanonicalRecord | undefined>(
      "readonly",
      (store) => store.get(key(id)),
    );
    return raw ? readPublication(raw, id, receipt) : undefined;
  }
  async lastProjectId(): Promise<string | undefined> {
    const value = await this.transaction<unknown>("readonly", (store) =>
      store.get(LAST_BROWSER_PROJECT),
    );
    return typeof value === "string" ? value : undefined;
  }
  async clear(id: string): Promise<void> { await this.transaction('readwrite', store => store.delete(key(id))); }
  close(): void { this.database.close(); }
}
