import { expect, test, type Page } from '@playwright/test';
import type { AssetRecord } from '../../src/core/project';
import type { MockupRequest, MockupResult } from '../../src/mockups/providers';

interface MockupLifetimeProbe {
  root: { unmount(): void };
  liveUrls: Set<string>;
  createdUrls: string[];
  imports: number;
  importPending: boolean;
  generationPending: boolean;
  finishImport?: () => void;
  finishGeneration?: () => void;
}
declare global { interface Window { __mockupLifetimeProbe: MockupLifetimeProbe } }

const artwork = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#24504a"/></svg>';

async function mountPanel(page: Page, defer: 'import' | 'generation' | 'none') {
  await page.goto('/?render-proof');
  await expect(page.locator('[data-render-ready="true"]')).toBeVisible();
  await page.evaluate(async ({ defer, artwork }) => {
    const [{ default: { createElement } }, { default: { createRoot } }, { MockupsPanel }, { createProject }] = await Promise.all([
      import(/* @vite-ignore */ '/node_modules/.vite/deps/react.js' as string),
      import(/* @vite-ignore */ '/node_modules/.vite/deps/react-dom_client.js' as string),
      import(/* @vite-ignore */ '/src/studio/panels/MockupsPanel.tsx' as string),
      import(/* @vite-ignore */ '/src/core/project.ts' as string),
    ]);
    const container = document.createElement('div');
    container.id = 'mockup-lifetime-test'; container.style.cssText = 'position:fixed;inset:0;z-index:20;overflow:auto;background:#202020';
    document.body.append(container);
    const root = createRoot(container);
    const probe: MockupLifetimeProbe = { root, liveUrls: new Set(), createdUrls: [], imports: 0, importPending: false, generationPending: false };
    window.__mockupLifetimeProbe = probe;
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = originalCreate(blob); probe.liveUrls.add(url); probe.createdUrls.push(url); return url;
    };
    URL.revokeObjectURL = url => { probe.liveUrls.delete(url); originalRevoke(url); };
    const record: AssetRecord = { id: 'test-import', name: 'Surface.svg', path: 'assets/surface.svg', hash: 'a'.repeat(64), mimeType: 'image/svg+xml', width: 80, height: 40, origin: { kind: 'provided' } };
    root.render(createElement(MockupsPanel, {
      project: createProject('Lifetime regression'), resolveAsset: () => undefined, onInsert: () => {}, initialMode: 'scene',
      onImportAsset: async () => {
        probe.imports++;
        if (defer === 'import') {
          probe.importPending = true;
          await new Promise<void>(resolve => { probe.finishImport = resolve; });
        }
        return record;
      },
      provider: {
        id: 'lifetime-test-adapter', name: 'Lifecycle test',
        async generate(request: MockupRequest): Promise<MockupResult> {
          probe.generationPending = true;
          await new Promise<void>(resolve => { probe.finishGeneration = resolve; });
          return { image: new Blob([artwork], { type: 'image/svg+xml' }), kind: request.output, model: 'local-test', review: 'pending', provenance: { ...request, providerId: 'lifetime-test-adapter', generatedAt: '2026-10-15T00:00:00.000Z' } };
        },
      },
    }));
  }, { defer, artwork });
  await expect(page.locator('#mockup-lifetime-test').getByRole('heading', { name: 'Mockups' })).toBeVisible();
}

async function unmountThenComplete(page: Page, operation: 'import' | 'generation') {
  return await page.evaluate(async operation => {
    const probe = window.__mockupLifetimeProbe;
    probe.root.unmount();
    if (operation === 'import') probe.finishImport!(); else probe.finishGeneration!();
    // The deferred operation and the component continuations settle before checking resources.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return { liveUrls: [...probe.liveUrls], created: probe.createdUrls.length, imports: probe.imports };
  }, operation);
}

test('releases every preview URL when persistence resolves after panel unmount', async ({ page }) => {
  await mountPanel(page, 'import');
  await page.locator('#mockup-lifetime-test').getByLabel('Importar cena', { exact: true }).setInputFiles({ name: 'scene.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(artwork) });
  await page.waitForFunction(() => window.__mockupLifetimeProbe.importPending);
  const before = await page.evaluate(() => ({ created: window.__mockupLifetimeProbe.createdUrls.length, live: window.__mockupLifetimeProbe.liveUrls.size }));
  expect(before).toEqual({ created: 1, live: 0 }); // The real image decoding already completed.
  const after = await unmountThenComplete(page, 'import');
  expect(after.imports).toBe(1);
  expect(after.liveUrls).toEqual([]);
  expect(after.created).toBe(1); // No long-lived preview may be allocated after disposal.
});

test('does not import or allocate generated image previews after panel unmount', async ({ page }) => {
  await mountPanel(page, 'generation');
  await page.locator('#mockup-lifetime-test').getByRole('button', { name: 'Gerar imagem', exact: true }).click();
  await page.waitForFunction(() => window.__mockupLifetimeProbe.generationPending);
  const after = await unmountThenComplete(page, 'generation');
  expect(after.imports).toBe(0);
  expect(after.created).toBe(0);
  expect(after.liveUrls).toEqual([]);
});

test('switches an included surface to manual mode without discarding its editable corners', async ({ page }) => {
  await mountPanel(page, 'none');
  const panel = page.locator('#mockup-lifetime-test');
  await panel.getByRole('button', { name: 'Usar cena incluída' }).click();
  const surface = panel.getByRole('combobox', { name: 'Superfície incluída', exact: true });
  await expect(surface).toHaveValue('loose-card');
  await expect(panel.getByLabel('Superior esquerdo X', { exact: true })).toHaveValue('741');
  await surface.selectOption('');
  await expect(surface).toHaveValue('');
  await expect(panel.getByLabel('Superior esquerdo X', { exact: true })).toHaveValue('741');
  await expect(panel.getByLabel('Superior esquerdo Y', { exact: true })).toHaveValue('529');
  await page.evaluate(() => window.__mockupLifetimeProbe.root.unmount());
  expect(await page.evaluate(() => window.__mockupLifetimeProbe.liveUrls.size)).toBe(0);
});
