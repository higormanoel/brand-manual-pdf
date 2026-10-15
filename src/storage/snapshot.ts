import { relativeAssetPathSchema } from '../core/assets';
import { parseProject, type BrandProject } from '../core/project';
export const MAX_ASSET_BYTES = 32 * 1024 * 1024;
export const MAX_BUNDLE_BYTES = 128 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
export const MAX_STATE_BYTES = 64 * 1024 * 1024;
export const MAX_BUNDLE_ENTRIES = 2048;
export interface ProjectSnapshot { readonly revision: number; readonly project: BrandProject; readonly assets: Readonly<Record<string, Uint8Array>> }
const utf8 = new TextEncoder();
/** The portable format is compact UTF-8 JSON everywhere, including historical revisions. */
export function serializeProject(project: BrandProject): Uint8Array {
  const bytes = utf8.encode(JSON.stringify(project));
  if (bytes.length > MAX_PROJECT_BYTES) throw new Error('Project size limit exceeded'); return bytes;
}
function pathKey(relative: string): string { return relative.normalize('NFD').toLowerCase(); }
export function validateAssetStoragePath(relative: string): void {
  relativeAssetPathSchema.parse(relative);
  if (relative.split('/').some(part => /[. ]$/.test(part))) throw new Error('Asset path has a nonportable filesystem alias');
  const root = pathKey(relative.split('/')[0]);
  if (['project.marquio.json', 'project.json', 'revisions', 'commits', '.marquio-write-lock', '.marquio-tmp'].includes(root)) throw new Error('Asset path overlaps project metadata');
}
/** Validate the whole manifest before writes, including aliases and file/directory collisions. */
export function validateProjectLayout(project: BrandProject): Uint8Array {
  const serialized = serializeProject(project); const paths = new Map<string, string>(); const files = new Set<string>(); const directories = new Set<string>();
  for (const asset of project.assets) {
    validateAssetStoragePath(asset.path); const key = pathKey(asset.path); const previous = paths.get(key);
    if (previous !== undefined && previous !== asset.path) throw new Error('Asset path alias collision');
    if (directories.has(key)) throw new Error('Asset file/directory path collision');
    const parts = key.split('/');
    for (let index = 1; index < parts.length; index++) { const directory = parts.slice(0, index).join('/'); if (files.has(directory)) throw new Error('Asset file/directory path collision'); directories.add(directory); }
    paths.set(key, asset.path); files.add(key);
  }
  // Exports explicitly disable implicit directory entries: project.json plus each unique asset file.
  if (paths.size + 1 > MAX_BUNDLE_ENTRIES) throw new Error('Bundle entry limit exceeded');
  return serialized;
}
/** Exact overhead for our JSZip STORE output (no comments, directory entries, descriptors or ZIP64). */
export function storedZipSize(files: Readonly<Record<string, number>>): number {
  return Object.entries(files).reduce((size, [name, bytes]) => {
    const encoded = utf8.encode(name).length;
    const unicodeExtra = encoded !== name.length ? 9 + encoded : 0;
    if (encoded + unicodeExtra > 65535) throw new Error('Bundle path size limit exceeded');
    return size + bytes + 76 + 2 * (encoded + unicodeExtra);
  }, 22);
}
export async function sha256(bytes: Uint8Array): Promise<string> { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes))), value => value.toString(16).padStart(2, '0')).join(''); }
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
/** All source bytes are captured synchronously, before the first digest can yield to the caller. */
export async function createSnapshot(projectInput: unknown, input: Readonly<Record<string, Uint8Array>>): Promise<ProjectSnapshot> {
  const project = parseProject(projectInput); const serialized = validateProjectLayout(project);
  const borrowed: Record<string, Uint8Array> = Object.create(null); const sizes: Record<string, number> = { 'project.json': serialized.length }; let total = serialized.length;
  for (const asset of project.assets) {
    const bytes = input[asset.path]; if (!(bytes instanceof Uint8Array)) throw new Error(`Missing asset: ${asset.path}`);
    if (bytes.length > MAX_ASSET_BYTES) throw new Error('Asset size limit exceeded');
    if (!Object.hasOwn(borrowed, asset.path)) { borrowed[asset.path] = bytes; sizes[asset.path] = bytes.length; total += bytes.length; }
  }
  if (total > MAX_BUNDLE_BYTES || storedZipSize(sizes) > MAX_BUNDLE_BYTES) throw new Error('Bundle size limit exceeded');
  const owned: Record<string, Uint8Array> = Object.create(null);
  for (const [name, bytes] of Object.entries(borrowed)) owned[name] = new Uint8Array(bytes);
  for (const asset of project.assets) if (await sha256(owned[asset.path]) !== asset.hash.toLowerCase()) throw new Error(`Asset hash integrity mismatch: ${asset.path}`);
  const assets: Record<string, Uint8Array> = Object.create(null);
  for (const [name, bytes] of Object.entries(owned)) Object.defineProperty(assets, name, { enumerable: true, get: () => new Uint8Array(bytes) });
  return Object.freeze({ revision: project.revision, project: freeze(project), assets: Object.freeze(assets) });
}
