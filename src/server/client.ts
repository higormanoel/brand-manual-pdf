import type { AssetImportInput, AssetRecord } from '../core/assets';
import type { CommandBatch, SaveAck } from '../core/commands';
import { parseProject, type BrandProject } from '../core/project';
import type { ProjectSnapshot } from '../storage/repository';
export class LocalApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly currentRevision?: number) { super(message); }
}
export interface LocalProjectClient {
  getProject(): Promise<BrandProject>; commit(batch: CommandBatch): Promise<SaveAck>;
  importAsset(input: AssetImportInput, batch: Pick<CommandBatch, 'commandId' | 'expectedRevision'>): Promise<{ asset: AssetRecord; ack: SaveAck }>;
  assetUrl(id: string, revision: number): string; snapshot(revision: number): Promise<ProjectSnapshot>; portable(revision: number): Promise<Uint8Array>;
}
function encodeBase64(bytes: Uint8Array): string {
  let binary = ''; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary);
}
function validateRevision(revision: number) { if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('A confirmed revision is required'); return revision; }
/** Establish the cookie before removing the bootstrap token; reloads then use the existing HttpOnly session. */
export async function connectLocalProject(options: { location?: Pick<Location, 'href' | 'origin' | 'hash'>; history?: Pick<History, 'replaceState'>; fetch?: typeof fetch } = {}): Promise<LocalProjectClient> {
  const location = options.location ?? globalThis.location; const history = options.history ?? globalThis.history; const doFetch = options.fetch ?? globalThis.fetch;
  const origin = location.origin;
  async function request(route: string, init?: RequestInit): Promise<Response> {
    const response = await doFetch(`${origin}${route}`, { credentials: 'same-origin', ...init });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new LocalApiError(response.status, data.code ?? 'local-api-error', data.message ?? response.statusText, data.currentRevision); }
    return response;
  }
  const post = async (route: string, input: unknown) => (await request(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).json();
  const fragment = new URLSearchParams(location.hash.slice(1)); const token = fragment.get('session');
  if (token) { await post('/api/session', { token }); const clean = new URL(location.href); fragment.delete('session'); clean.hash = fragment.toString(); history.replaceState(null, '', clean.href); }
  return {
    async getProject() { return parseProject(await (await request('/api/project')).json()); },
    async commit(batch) { const ack = await post('/api/commands', batch); return { commandId: ack.commandId, revision: ack.revision, project: parseProject(ack.project) }; },
    async importAsset(input, batch) { return post('/api/assets', { ...batch, name: input.name, mimeType: input.mimeType, origin: input.origin, bytesBase64: encodeBase64(input.bytes) }); },
    assetUrl(id, revision) { return `${origin}/api/assets/${encodeURIComponent(id)}?revision=${validateRevision(revision)}`; },
    async snapshot(revision) {
      const result = await (await request(`/api/snapshot?revision=${validateRevision(revision)}`)).json(); const project = parseProject(result.project);
      if (result.revision !== revision || project.revision !== revision) throw new Error('Snapshot revision mismatch');
      const assets: Record<string, Uint8Array> = Object.create(null);
      for (const asset of project.assets) {
        const encoded = result.assetsBase64?.[asset.path]; if (typeof encoded !== 'string') throw new Error(`Missing snapshot asset: ${asset.path}`);
        const owned = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        if (!Object.hasOwn(assets, asset.path)) Object.defineProperty(assets, asset.path, { enumerable: true, get: () => new Uint8Array(owned) });
      }
      const freeze = (value: unknown) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }; freeze(project);
      return Object.freeze({ revision, project, assets: Object.freeze(assets) });
    },
    async portable(revision) { return new Uint8Array(await (await request(`/api/portable?revision=${validateRevision(revision)}`)).arrayBuffer()); },
  };
}
