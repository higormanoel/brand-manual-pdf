import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { LocalServer } from '../../src/server/server';
import { importPortable } from '../../src/storage/portable';

// Break caught: a same-ID replacement must change mounted artwork, and an old URL
// must continue identifying the bytes reviewed in its original confirmed snapshot.
test('production same-ID asset replacement reloads confirmed pixels and retains historical URLs', async ({ page }) => {
  const { startStudio } = await import('../../dist/node/cli.js' as string);
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-asset-identity-'));
  let server: LocalServer | undefined;
  try {
    server = await startStudio({ folder, open: false, name: 'Asset identity proof' });
    const repo = server!.repository;
    const svg = (color: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${color}"/></svg>`);
    const redBytes = svg('#ff0000'), blueBytes = svg('#0000ff');
    const red = await repo.importAsset({ name: 'red.svg', mimeType: 'image/svg+xml', bytes: redBytes, origin: { kind: 'provided' } }, { commandId: 'red', expectedRevision: 0 });
    const blue = await repo.importAsset({ name: 'blue.svg', mimeType: 'image/svg+xml', bytes: blueBytes, origin: { kind: 'provided' } }, { commandId: 'blue', expectedRevision: 1 });
    const project = await repo.load();
    await repo.commit({ commandId: 'page', expectedRevision: 2, commands: [{ type: 'page.insert', page: { id: 'asset-page', sectionId: project.sections[0].id, title: 'Asset identity', width: 1920, height: 1080, background: '#ffffff', nodes: [{ id: 'identity-image', name: 'Identity artwork', type: 'image', assetId: red.asset.id, fit: 'contain', alt: 'Identity artwork', opacity: 1, visible: true, locked: false, origin: { kind: 'provided' }, approval: { status: 'approved' }, transform: { x: 100, y: 100, width: 600, height: 600, rotation: 0, scaleX: 1, scaleY: 1 } }] } }] });
    await page.goto(server!.url);
    await expect(page.getByRole('banner')).toContainText('Projeto local');
    const img = page.locator('.canvas-region [data-node-id="identity-image"] img');
    const pixels = async () => {
      await img.evaluate(async el => (el as HTMLImageElement).decode());
      const png = PNG.sync.read(await img.screenshot());
      const center = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4;
      return [...png.data.subarray(center, center + 3)];
    };
    expect(await pixels()).toEqual([255, 0, 0]);
    const oldUrl = await img.getAttribute('src');
    await repo.commit({ commandId: 'replace', expectedRevision: 3, commands: [{ type: 'asset.update', assetId: red.asset.id, patch: { path: blue.asset.path, hash: blue.asset.hash } }] });
    await page.getByRole('button', { name: 'Inserir texto', exact: true }).click();
    await page.getByRole('button', { name: 'Recarregar versão confirmada', exact: true }).click();
    await expect(page.locator('.studio')).toHaveAttribute('data-confirmed-revision', '4');
    expect(await pixels()).toEqual([0, 0, 255]);
    const newUrl = await img.getAttribute('src');
    expect(newUrl).not.toBe(oldUrl);
    const response = await page.request.get(newUrl!);
    expect(await response.body()).toEqual(Buffer.from(blueBytes));
    const portable = await page.request.get(`${server!.origin}/api/portable?revision=4`);
    const source = await importPortable(new Uint8Array(await portable.body()));
    const confirmed = source.project.assets.find(a => a.id === red.asset.id)!;
    expect(source.assets[confirmed.path]).toEqual(blueBytes);
    // Change it again later: historical requests still resolve their own snapshot.
    await repo.commit({ commandId: 'later', expectedRevision: 4, commands: [{ type: 'asset.update', assetId: red.asset.id, patch: { path: red.asset.path, hash: red.asset.hash } }] });
    expect(await (await page.request.get(oldUrl!)).body()).toEqual(Buffer.from(redBytes));
    expect(await (await page.request.get(newUrl!)).body()).toEqual(Buffer.from(blueBytes));
    await page.screenshot({ path: test.info().outputPath('confirmed-blue.png') });
  } finally {
    await server?.close();
    await fs.rm(folder, { recursive: true, force: true });
  }
});
