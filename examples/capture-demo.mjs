#!/usr/bin/env node
// Capture only a temporary copy. All navigation and edits use production Studio controls.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { chromium, expect } from '@playwright/test';
import { runCli } from '../dist/node/cli.js';
const source = process.argv[2];
if (!source) throw new Error('Usage: node examples/capture-demo.mjs <canonical-demo-folder> [output-folder]');
const output = path.resolve(process.argv[3] ?? 'docs/assets');
await fs.mkdir(output, { recursive: true });
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-public-capture-'));
const folder = path.join(temporary, 'aurora-copy');
await fs.cp(path.resolve(source), folder, { recursive: true });
const server = await runCli(['studio', folder, '--no-open', '--port', '4190'], () => {});
let browser;
let recording = false;
let recorder;
try {
  let executablePath = process.env.MARQUIO_CHROMIUM_EXECUTABLE;
  if (!executablePath && process.platform === 'darwin') {
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    try { await fs.access(chrome); executablePath = chrome; } catch {}
  }
  browser = await chromium.launch({ headless: true, executablePath });
  const project = await server.repository.load();
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(server.url);
  await expect(page.getByRole('banner')).toContainText('Projeto local');
  await expect(page).not.toHaveURL(/session=/);
  await expect(page.getByRole('status').first()).toContainText('Confirmado');
  async function select(id) {
    const index = project.pages.findIndex(item => item.id === id);
    if (index < 0) throw new Error(`Missing demo page ${id}`);
    await page.getByRole('button', { name: `Página ${index + 1}: ${project.pages[index].title}`, exact: true }).click();
    await page.getByRole('button', { name: 'Ajustar à janela', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.locator('.canvas-region img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  }
  await select('demo-application-0');
  recording = true;
  const frames = [];
  recorder = (async () => {
    while (recording) {
      const name = `frame-${String(frames.length).padStart(5, '0')}.jpg`;
      const time = performance.now();
      await page.screenshot({ path: path.join(temporary, name), type: 'jpeg', quality: 85 });
      frames.push({ name, time });
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  })();
  await page.locator('.canvas-region [data-hit-id]').first().click();
  await page.screenshot({ path: path.join(output, 'studio-desktop.png') });
  await page.waitForTimeout(1200);
  await select('demo-application-1');
  await page.waitForTimeout(1000);
  await select('demo-application-2');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Inserir texto', exact: true }).click();
  await page.getByLabel('Conteúdo do texto').fill('Aplicação editável');
  await page.getByLabel('Conteúdo do texto').press('Tab');
  await expect(page.getByRole('status').first()).toContainText('Confirmado');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Confirmado');
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Backup portátil', exact: true }).click();
  await page.waitForTimeout(900);
  recording = false;
  await recorder;
  const sequence = frames.map((frame, index) => `file '${frame.name}'\nduration ${((frames[index + 1]?.time ?? frame.time + 200) - frame.time) / 1000}`).join('\n');
  await fs.writeFile(path.join(temporary, 'frames.txt'), sequence + '\n');
  await fs.writeFile(path.join(temporary, 'frames.json'), JSON.stringify(frames));
  const palette = project.pages.find(item => item.title === 'Paleta de cores');
  await select(palette.id);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole('button', { name: 'Ajustar à janela', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'studio-narrow.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Páginas', exact: true }).click();
  await select('demo-application-0');
  await page.getByRole('button', { name: 'Prancheta', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar à janela', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'studio-mobile.png') });
  await context.close();
  try {
    await promisify(execFile)(process.env.MARQUIO_FFMPEG_EXECUTABLE ?? 'ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(temporary, 'frames.txt'), '-vf', 'fps=5,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer', '-loop', '0', path.join(output, 'studio-walkthrough.gif')], { maxBuffer: 1024 * 1024 });
  } catch {
    await promisify(execFile)(process.env.MARQUIO_PYTHON ?? 'python3', [fileURLToPath(new URL('./frames-to-gif.py', import.meta.url)), temporary, path.join(output, 'studio-walkthrough.gif')], { maxBuffer: 1024 * 1024 });
  }
  console.log(JSON.stringify({ output, mode: 'production local runtime', copiedSourceRevision: project.revision, finalCopyRevision: (await server.repository.load()).revision }));
} finally { recording = false; await recorder?.catch(() => {}); await browser?.close(); await server.close(); await fs.rm(temporary, { recursive: true, force: true }); }
