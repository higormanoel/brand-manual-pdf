import { relativeAssetPathSchema } from '../core/assets';
import { parseProject, type BrandProject } from '../core/project';
export const MAX_ASSET_BYTES = 32 * 1024 * 1024;
export const MAX_BUNDLE_BYTES = 128 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
export interface ProjectSnapshot { readonly revision: number; readonly project: BrandProject; readonly assets: Readonly<Record<string, Uint8Array>> }
export function validateAssetStoragePath(relative: string): void {
  relativeAssetPathSchema.parse(relative); const root = relative.split('/')[0];
  if (['project.marquio.json', 'project.json', 'revisions', '.marquio-write-lock'].includes(root)) throw new Error('Asset path overlaps project metadata');
}
export async function sha256(bytes: Uint8Array): Promise<string> { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))), value => value.toString(16).padStart(2, '0')).join(''); }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
/** Each access to binary data returns a copy: export clients cannot mutate a retained revision. */
export async function createSnapshot(projectInput: unknown, input: Readonly<Record<string, Uint8Array>>): Promise<ProjectSnapshot> {
  const project = parseProject(projectInput); const assets: Record<string, Uint8Array> = Object.create(null); let total = 0;
  for (const asset of project.assets) {
    validateAssetStoragePath(asset.path);
    const bytes = input[asset.path]; if (!(bytes instanceof Uint8Array)) throw new Error(`Missing asset: ${asset.path}`);
    if (bytes.length > MAX_ASSET_BYTES || (total += bytes.length) > MAX_BUNDLE_BYTES) throw new Error('Asset size limit exceeded');
    if (await sha256(bytes) !== asset.hash.toLowerCase()) throw new Error(`Asset hash integrity mismatch: ${asset.path}`);
    if (!Object.hasOwn(assets, asset.path)) { const owned = new Uint8Array(bytes); Object.defineProperty(assets, asset.path, { enumerable: true, get: () => new Uint8Array(owned) }); }
  }
  return Object.freeze({ revision: project.revision, project: freeze(project), assets: Object.freeze(assets) });
}
