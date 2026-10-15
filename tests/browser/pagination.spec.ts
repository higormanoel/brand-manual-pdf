import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type { TextMeasureRequest } from '../../src/render/textMeasurement';

test('continues complete text using uploaded font metrics and leaves prior edited variants intact', async ({ page }, info) => {
  await page.goto('/?render-proof');
  await expect(page.locator('[data-render-ready="true"]')).toBeVisible();
  const proof = await page.evaluate(async () => {
    const { createProject, parseProject } = await import(/* @vite-ignore */ '/src/core/project.ts' as string);
    const { generateManual } = await import(/* @vite-ignore */ '/src/editorial/generate.ts' as string);
    const { measureText, textCSS } = await import(/* @vite-ignore */ '/src/render/textMeasurement.ts' as string);
    const face = new FontFace('Uploaded Editorial Proof', 'url(/node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2)');
    await face.load(); document.fonts.add(face);
    const project = createProject('Presença');
    project.editorial.bodyFontFamily = '"Uploaded Editorial Proof", sans-serif';
    const source = project.sections.find((s: { kind: string }) => s.kind === 'brand-strategy');
    const text = ('Uma pausa no café: presença, atenção e espaço. 👩🏽‍💻 cafe\u0301.\n\n').repeat(300);
    source.content = { paragraphs: [text], rules: [], assetIds: [], colorIds: [], typographyIds: [] };
    const result = await generateManual(project, { measureText, variantId: 'first' });
    project.pages = structuredClone(result.sections.flatMap((s: { pages: unknown[] }) => s.pages));
    project.pages[0].nodes[0].manuallyEdited = true;
    const before = JSON.stringify(project);
    const next = await generateManual(project, { measureText, variantId: 'second' });
    parseProject({ ...project, pages: next.sections.flatMap((s: { pages: unknown[] }) => s.pages) });
    const continuation = result.sections.find((s: { sectionId: string }) => s.sectionId === source.id).pages.filter((p: { nodes: { name: string }[] }) => p.nodes.some(n => n.name.startsWith('body-')));
    const preserved = continuation.flatMap((p: { nodes: { type: string; name: string; text: string }[] }) => p.nodes.filter(n => n.type === 'text' && n.name.startsWith('body-')).map(n => n.text)).join('');
    const errors: string[] = [];
    const root = document.createElement('div'); root.id = 'pagination-proof'; document.body.replaceChildren(root);
    for (const p of continuation) {
      const artboard = document.createElement('section');
      Object.assign(artboard.style, { width: '1920px', height: '1080px', position: 'relative', background: p.background }); root.append(artboard);
      for (const n of p.nodes) {
        if (n.type !== 'text') continue;
        const m = await measureText({ text: n.text, style: n.style, width: n.transform.width, height: n.transform.height });
        if (m.overflow || !m.fontAvailable) errors.push(n.id);
        if (n.name.startsWith('body-') && (n.transform.y < 220 || n.transform.y + n.transform.height > 940)) errors.push(`collision:${n.id}`);
        const el = document.createElement('div'); el.textContent = n.text;
        Object.assign(el.style, textCSS(n.style), { position: 'absolute', left: `${n.transform.x}px`, top: `${n.transform.y}px`, width: `${n.transform.width}px`, height: `${n.transform.height}px`, fontSize: `${n.style.fontSize}px`, letterSpacing: `${n.style.letterSpacing}px` }); artboard.append(el);
        if (el.scrollHeight > el.clientHeight + .5 || el.scrollWidth > el.clientWidth + .5) errors.push(`dom-overflow:${n.id}`);
      }
    }
    return { sameText: preserved === text, pages: continuation.length, errors, unchanged: JSON.stringify(project) === before, oldIds: result.sections.flatMap((s: { pages: { id: string }[] }) => s.pages.map(p => p.id)), newIds: next.sections.flatMap((s: { pages: { id: string }[] }) => s.pages.map(p => p.id)) };
  });
  expect(proof.sameText).toBe(true);
  expect(proof.pages).toBeGreaterThan(2);
  expect(proof.errors).toEqual([]);
  expect(proof.unchanged).toBe(true);
  expect(proof.oldIds.filter((id: string) => proof.newIds.includes(id))).toEqual([]);
  writeFileSync(info.outputPath('pagination-proof.json'), JSON.stringify(proof, null, 2));
  await page.locator('#pagination-proof > section').first().screenshot({ path: info.outputPath('pagination-first.png') });
});

test('renders the portable fictitious fixture without local fonts and keeps all live text inside its boxes', async ({ page }, info) => {
  // Break caught: the bundled demo must not depend on installed proprietary fonts.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await cdp.send('CSS.setLocalFontsEnabled', { enabled: false });
  await page.goto('/?render-proof');
  await expect(page.locator('[data-render-ready="true"]')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { parseProject } = await import(/* @vite-ignore */ '/src/core/project.ts' as string);
    const { generateManual } = await import(/* @vite-ignore */ '/src/editorial/generate.ts' as string);
    const { measureText } = await import(/* @vite-ignore */ '/src/render/textMeasurement.ts' as string);
    const { preflight } = await import(/* @vite-ignore */ '/src/render/preflight.ts' as string);
    const { renderManualProof } = await import(/* @vite-ignore */ '/tests/editorial/browserProof.tsx' as string);
    const { loadProjectFonts } = await import(/* @vite-ignore */ '/src/render/fonts.ts' as string);
    const { createSnapshot, sha256 } = await import(/* @vite-ignore */ '/src/storage/snapshot.ts' as string);
    const { exportPortable, importPortable } = await import(/* @vite-ignore */ '/src/storage/portable.ts' as string);
    const original = parseProject(await (await fetch('/fixtures/aurora/project.json')).json());
    const assets: Record<string, Uint8Array> = {};
    for (const asset of original.assets) assets[asset.path] = new Uint8Array(await (await fetch(`/fixtures/aurora/${asset.path}`)).arrayBuffer());
    const reopened = await importPortable(await exportPortable(await createSnapshot(original, assets)));
    const project = reopened.project;
    const urls: string[] = [];
    const fonts = await loadProjectFonts(project, (asset: { path: string; mimeType: string }) => {
      const url = URL.createObjectURL(new Blob([new Uint8Array(reopened.assets[asset.path]).buffer], { type: asset.mimeType }));
      urls.push(url); return url;
    });
    const display = project.brand.typography.find((f: { id: string }) => f.id === 'font-display');
    const licenseAsset = project.assets.find((a: { path: string }) => a.path === 'assets/LibreBaskerville-OFL.txt');
    const fontAsset = project.assets.find((a: { id: string }) => a.id === display.assetId);
    const faceWeightsBeforeMeasurement = [...window.document.fonts].filter(f => f.family.replaceAll('"', '') === 'Libre Baskerville' && f.status === 'loaded').map(f => f.weight).sort();
    // CDP disables CSS local() sources. Also audit every measurement against
    // registered web faces: installed family matching must never make this proof pass.
    const unbundledMeasurements: string[] = [];
    const projectOnlyMeasure: typeof measureText = async (request: TextMeasureRequest) => {
      const primary = request.style.fontFamily.split(',')[0].replaceAll('"', '').trim();
      if (![...window.document.fonts].some(f => f.family.replaceAll('"', '') === primary && f.status === 'loaded')) unbundledMeasurements.push(primary);
      return measureText(request);
    };
    const generated = await generateManual(project, { measureText: projectOnlyMeasure, variantId: 'fixture-proof' });
    const pages = generated.sections.flatMap((s: { pages: unknown[] }) => s.pages);
    const document = parseProject({ ...project, pages });
    const measurements: Record<string, unknown> = {};
    for (const p of document.pages) for (const n of p.nodes) if (n.type === 'text') measurements[n.id] = await measureText({ text: n.text, style: n.style, width: n.transform.width, height: n.transform.height });
    await renderManualProof(project, pages);
    const openers = document.pages.filter((p: { nodes: { name: string }[] }) => p.nodes.some(n => n.name === 'chapter-number')).map((p: { id: string; nodes: { id: string; name: string; transform: { y: number }; style: { color: string; fontSize: number } }[] }) => {
      const number = p.nodes.find(n => n.name === 'chapter-number')!;
      const title = p.nodes.find(n => n.name === 'chapter-title')!;
      return { pageId: p.id, numberId: number.id, titleId: title.id, numberY: number.transform.y, titleY: title.transform.y };
    });
    return { licenseHash: licenseAsset ? await sha256(reopened.assets[licenseAsset.path]) : null, fonts, unbundledMeasurements, faceWeightsBeforeMeasurement, fontHash: fontAsset ? await sha256(reopened.assets[fontAsset.path]) : null, fontBytes: fontAsset ? reopened.assets[fontAsset.path].length : 0, pages: pages.length, nodes: pages.reduce((n: number, p: { nodes: unknown[] }) => n + p.nodes.length, 0), openers, diagnostics: [...generated.diagnostics, ...preflight(document, measurements)] };
  });
  expect(result.fonts.filter((font: { typographyId: string }) => font.typographyId === 'font-display')).toEqual([
    expect.objectContaining({ family: 'Libre Baskerville', weight: 400, status: 'loaded', source: 'asset' }),
    expect.objectContaining({ family: 'Libre Baskerville', weight: 700, status: 'loaded', source: 'asset' }),
  ]);
  expect(result.fonts.every((font: { status: string }) => font.status === 'loaded')).toBe(true);
  expect(result.unbundledMeasurements).toEqual([]);
  expect(result.faceWeightsBeforeMeasurement).toEqual(['400', '700']);
  expect(result.fontHash).toBe('05a95421961341c5b2556285e8415df9db27dab4f4abe22b446b3c6a8b916c5d');
  expect(result.fontBytes).toBe(171900);
  expect(result.licenseHash).toBe('3624eddd4c8f8a908130a417ae7cd089c9da69899c4e0ca1a5217d0a6fae16fd');
  expect(result.pages).toBeGreaterThan(15);
  expect(result.diagnostics).toEqual([]);
  const overflow = await page.locator('[data-text-content]').evaluateAll(elements => elements.flatMap(element => {
    const node = element.closest('[data-node-id]') as HTMLElement;
    const e = element as HTMLElement;
    return e.scrollHeight > node.clientHeight + .5 || e.scrollWidth > node.clientWidth + .5 ? [node.dataset.nodeId] : [];
  }));
  expect(overflow).toEqual([]);
  expect(result.openers).toHaveLength(8);
  for (const opener of result.openers) {
    expect(opener.numberY).toBeGreaterThan(540);
    expect(opener.titleY).toBeGreaterThan(720);
    await expect(page.locator(`[data-node-id="${opener.numberId}"] [data-text-content]`)).toHaveCSS('color', 'rgb(56, 57, 59)');
    await expect(page.locator(`[data-node-id="${opener.numberId}"] [data-text-content]`)).toHaveCSS('font-size', '72px');
  }
  await expect(page.locator('[data-node-type="image"] img')).toHaveCount(5);
  writeFileSync(info.outputPath('fixture-metrics.json'), JSON.stringify(result, null, 2));
  await page.locator('#editorial-contact-sheet').screenshot({ path: info.outputPath('aurora-contact-sheet.png') });
  await page.locator(`[data-artboard-id="${result.openers[0].pageId}"]`).screenshot({ path: info.outputPath('opener-thumbnail.png') });
});

test('retains pending item provenance and omits empty voice examples with real browser measurements', async ({ page }, info) => {
  await page.goto('/?render-proof');
  await expect(page.locator('[data-render-ready="true"]')).toBeVisible();
  const proof = await page.evaluate(async () => {
    const { createProject, parseProject } = await import(/* @vite-ignore */ '/src/core/project.ts' as string);
    const { generateManual } = await import(/* @vite-ignore */ '/src/editorial/generate.ts' as string);
    const { measureText } = await import(/* @vite-ignore */ '/src/render/textMeasurement.ts' as string);
    const project = parseProject(await (await fetch('/fixtures/aurora/project.json')).json());
    project.sections.forEach((s: { origin: unknown; approval: unknown }) => { s.origin = { kind: 'provided' }; s.approval = { status: 'approved' }; });
    for (const item of [project.brand.colors[0], project.brand.typography[0], project.brand.logos[1]]) {
      item.origin = { kind: 'suggested', description: 'Pending proof item' }; item.approval = { status: 'pending' };
    }
    const before = JSON.stringify(project);
    const generated = await generateManual(project, { measureText, variantId: 'pending-proof' });
    const nodes = generated.sections.flatMap((s: { pages: { nodes: unknown[] }[] }) => s.pages.flatMap(p => p.nodes));
    const identity = nodes.filter((n: { type: string; name: string; assetId?: string }) => n.name === 'swatch-forest' || n.name.startsWith('specimen-font-display') || (n.type === 'image' && n.assetId === 'asset-logo-reversed')).map((n: { name: string; origin: unknown; approval: unknown }) => ({ name: n.name, origin: n.origin, approval: n.approval }));
    const partial = createProject('Vereda');
    partial.brand.voice = { traits: [], do: [], avoid: [], modes: [{ id: 'voice-empty', name: '', do: [], dont: [], examples: [{ wrong: '  ', right: '' }] }] };
    const empty = await generateManual(parseProject(partial), { measureText, variantId: 'empty-proof' });
    partial.brand.voice.modes[0].examples = [{ wrong: '', right: 'Venha no seu tempo.' }];
    const right = await generateManual(parseProject(partial), { measureText, variantId: 'partial-proof' });
    const text = right.sections.flatMap((s: { pages: { nodes: { type: string; text?: string }[] }[] }) => s.pages.flatMap(p => p.nodes.filter(n => n.type === 'text').map(n => n.text)));
    return { identity, unchanged: before === JSON.stringify(project), emptyPages: empty.sections.flatMap((s: { pages: unknown[] }) => s.pages).length, partialText: text };
  });
  expect(proof.identity).toHaveLength(4);
  for (const node of proof.identity) {
    expect(node.origin).toEqual({ kind: 'suggested', description: 'Pending proof item' });
    expect(node.approval).toEqual({ status: 'pending' });
  }
  expect(proof.unchanged).toBe(true);
  expect(proof.emptyPages).toBe(1);
  expect(proof.partialText).toContain('Venha no seu tempo.');
  expect(proof.partialText).toContain('Exemplo correto');
  expect(proof.partialText).not.toContain('Exemplo incorreto');
  writeFileSync(info.outputPath('review-regressions.json'), JSON.stringify(proof, null, 2));
});
