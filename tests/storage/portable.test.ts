import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { createProject } from '../../src/core/project';
import { ProjectRepository } from '../../src/storage/repository';
import { exportPortable, importPortable } from '../../src/storage/portable';
async function encodeZip(entries: Record<string, Uint8Array>) { const zip = new JSZip(); for (const [name, bytes] of Object.entries(entries)) zip.file(name, bytes); return zip.generateAsync({ type: 'uint8array' }); }
describe('portable bundles', () => {
  it('reopens original image and font bytes after removing the source project folder', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-portable-'));
    const repo = await ProjectRepository.open(dir, { project: createProject('Portable') });
    const image = await repo.importAsset({ name: 'logo.svg', mimeType: 'image/svg+xml', bytes: new TextEncoder().encode('<svg/>'), origin: { kind: 'manual' } }, { commandId: 'image', expectedRevision: 0 });
    const font = await repo.importAsset({ name: 'font.woff2', mimeType: 'font/woff2', bytes: new Uint8Array([1, 7, 9]), origin: { kind: 'manual' } }, { commandId: 'font', expectedRevision: 1 });
    const bytes = await exportPortable(await repo.snapshot(2)); await fs.rm(dir, { recursive: true });
    expect([...bytes.slice(0, 2)]).toEqual([80, 75]);
    const reopened = await importPortable(bytes);
    expect([...reopened.assets[font.asset.path]]).toEqual([1, 7, 9]); expect(new TextDecoder().decode(reopened.assets[image.asset.path])).toBe('<svg/>');
    expect(new TextDecoder().decode(bytes)).not.toContain('commandId');
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-restored-'));
    try { const restored = await ProjectRepository.open(target, { snapshot: reopened }); expect((await restored.load()).revision).toBe(2); } finally { await fs.rm(target, { recursive: true }); }
  });
  it('rejects traversal, future versions, missing asset files and hash mismatch', async () => {
    await expect(importPortable(await encodeZip({ '../escape': new Uint8Array([1]) }))).rejects.toThrow(/path/i);
    const p = createProject('Invalid');
    await expect(importPortable(await encodeZip({ 'project.json': new TextEncoder().encode(JSON.stringify({ ...p, schemaVersion: 99 })) }))).rejects.toThrow(/versão/i);
    p.assets.push({ id: 'image', path: 'assets/a', hash: '0'.repeat(64), name: 'a', mimeType: 'image/png', origin: { kind: 'manual' } });
    await expect(importPortable(await encodeZip({ 'project.json': new TextEncoder().encode(JSON.stringify(p)) }))).rejects.toThrow(/missing/i);
    await expect(importPortable(await encodeZip({ 'project.json': new TextEncoder().encode(JSON.stringify(p)), 'assets/a': new Uint8Array([1]) }))).rejects.toThrow(/hash/i);
  });
});

it('reopens a validated portable manifest with ordinary relative font paths', async () => {
  const { createHash } = await import('node:crypto'); const p = createProject('Fonts'); const bytes = new Uint8Array([3, 4]);
  p.assets.push({ id: 'font', path: 'fonts/original.woff2', name: 'original.woff2', mimeType: 'font/woff2', hash: createHash('sha256').update(bytes).digest('hex'), origin: { kind: 'manual' } });
  const snapshot = await importPortable(await encodeZip({ 'project.json': new TextEncoder().encode(JSON.stringify(p)), 'fonts/original.woff2': bytes }));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-font-path-'));
  try { const repo = await ProjectRepository.open(dir, { snapshot }); expect([...((await repo.snapshot(0)).assets['fonts/original.woff2'])]).toEqual([3, 4]); } finally { await fs.rm(dir, { recursive: true }); }
});

it('rejects declared oversized files before decompressing or checking their CRC', async () => {
  const packed = Buffer.from(await encodeZip({ 'assets/bomb': new Uint8Array([1]) }));
  const central = packed.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  // The archive claims a >32 MiB file with an invalid CRC; validation must reject the size first.
  packed.writeUInt32LE(33 * 1024 * 1024, central + 24); packed.writeUInt32LE(0, central + 16);
  await expect(importPortable(packed)).rejects.toThrow(/size limit/i);
});

it('bounds the streamed output when a ZIP entry understates its uncompressed size', async () => {
  const packed = Buffer.from(await encodeZip({ 'assets/understated': new Uint8Array(64 * 1024) }));
  const central = packed.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); packed.writeUInt32LE(1, central + 24);
  await expect(importPortable(packed)).rejects.toThrow(/size limit/i);
});

it('provides browser-only portable backup functions without a Node runtime', async () => {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents: "export { exportPortable, importPortable } from './src/storage/portable';", resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent' });
  expect(result.outputFiles.length).toBe(1);
});
