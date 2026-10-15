import JSZip from 'jszip';
import { relativeAssetPathSchema } from '../core/assets';
import { parseProject } from '../core/project';
import { createSnapshot, MAX_ASSET_BYTES, MAX_BUNDLE_BYTES, MAX_PROJECT_BYTES, type ProjectSnapshot } from './snapshot';
export async function exportPortable(input: ProjectSnapshot): Promise<Uint8Array> {
  if (input.revision !== input.project.revision) throw new Error('Snapshot revision mismatch');
  const snapshot = await createSnapshot(input.project, input.assets); const zip = new JSZip();
  zip.file('project.json', JSON.stringify(snapshot.project, null, 2));
  for (const asset of snapshot.project.assets) zip.file(asset.path, snapshot.assets[asset.path]);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
async function readEntry(entry: JSZip.JSZipObject, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // JSZip exposes this browser stream at runtime but omits it from JSZipObject's declarations.
    const stream = (entry as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array'); const chunks: Uint8Array[] = []; let size = 0;
    stream.on('data', (chunk: Uint8Array) => {
      size += chunk.length;
      if (size > limit) { stream.pause(); reject(new Error('Bundle size limit exceeded')); return; }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => { const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } resolve(result); });
    stream.resume();
  });
}
export async function importPortable(bytes: Uint8Array): Promise<ProjectSnapshot> {
  if (bytes.length > MAX_BUNDLE_BYTES) throw new Error('Bundle size limit exceeded');
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: false, createFolders: false });
  const entries = Object.values(zip.files); if (entries.length > 2048) throw new Error('Bundle entry limit exceeded');
  let total = 0; const files: Record<string, Uint8Array> = Object.create(null);
  for (const entry of entries) {
    const original = entry.unsafeOriginalName ?? entry.name;
    relativeAssetPathSchema.parse(entry.dir ? original.replace(/\/$/, '') : original);
    if (entry.dir) continue;
    if (original !== entry.name) throw new Error('Unsafe ZIP path');
    // JSZip provides declared sizes before decompression. Bound ZIP bombs before allocating their output.
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    const limit = entry.name === 'project.json' ? MAX_PROJECT_BYTES : MAX_ASSET_BYTES;
    if (size === undefined || !Number.isSafeInteger(size) || size < 0 || size > limit || (total += size) > MAX_BUNDLE_BYTES) throw new Error('Bundle size limit exceeded');
    files[entry.name] = await readEntry(entry, Math.min(size, limit));
    if (files[entry.name].length > limit) throw new Error('Bundle size limit exceeded');
  }
  if (!files['project.json']) throw new Error('Missing project.json');
  const project = parseProject(JSON.parse(new TextDecoder().decode(files['project.json'])));
  const allowed = new Set(['project.json', ...project.assets.map(a => a.path)]);
  if (Object.keys(files).some(name => !allowed.has(name))) throw new Error('Unexpected bundle path');
  return createSnapshot(project, files);
}
