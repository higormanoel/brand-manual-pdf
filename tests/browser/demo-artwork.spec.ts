import { test, expect } from '@playwright/test';

// Imported SVG images cannot inherit host FontFace registrations. A live text
// element here would permit silent substitution even when the manual passes preflight.
for (const path of [
  '/fixtures/aurora/assets/logo.svg',
  '/fixtures/aurora/assets/logo-reversed.svg',
  '/demo-artwork/aurora-card.svg',
  '/demo-artwork/aurora-poster.svg',
  '/demo-artwork/aurora-screen.svg',
]) test(`isolated demo artwork carries font-independent geometry: ${path}`, async ({ page }) => {
  await page.goto('/?render-proof');
  const result = await page.evaluate(async path => {
    const source = await (await fetch(path)).text();
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
    const img = new Image(); img.src = path; await img.decode();
    return {
      liveText: svg.querySelectorAll('text, tspan, textPath, foreignObject').length,
      externalResources: [...svg.querySelectorAll('[href]')].map(e => e.getAttribute('href')).filter(href => !href?.startsWith('#')),
      accessibleName: svg.documentElement.getAttribute('aria-label'),
      geometry: svg.querySelectorAll('path').length,
      width: img.naturalWidth,
      height: img.naturalHeight,
    };
  }, path);
  expect(result.liveText).toBe(0);
  expect(result.externalResources).toEqual([]);
  expect(result.accessibleName).toBeTruthy();
  expect(result.geometry).toBeGreaterThan(0);
  expect(result.width).toBeGreaterThan(0);
  expect(result.height).toBeGreaterThan(0);
});
