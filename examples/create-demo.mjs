#!/usr/bin/env node
// Reuse the production CLI; this does not implement a second demo generator.
import fs from 'node:fs/promises';
import path from 'node:path';
import { runCli } from '../dist/node/cli.js';
const destination = path.resolve(process.argv[2] ?? 'marquio-demo-output');
const folder = path.join(destination, 'aurora');
const pdf = path.join(destination, 'Aurora.pdf');
const portable = path.join(destination, 'Aurora.marquio.zip');
for (const target of [folder, pdf, portable]) {
  try { await fs.access(target); throw new Error(`Refusing to replace existing example: ${target}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await fs.mkdir(destination, { recursive: true });
const server = await runCli(['studio', folder, '--demo', '--no-open'], () => {});
try {
  const project = await server.repository.load();
  await runCli(['export', folder, '--output', pdf, '--revision', String(project.revision)]);
  const session = new URL(server.url);
  const token = new URLSearchParams(session.hash.slice(1)).get('session');
  const exchanged = await fetch(`${server.origin}/api/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: server.origin }, body: JSON.stringify({ token }),
  });
  if (!exchanged.ok) throw new Error('Could not open the local demo session.');
  const cookie = exchanged.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const result = await fetch(`${server.origin}/api/portable?revision=${project.revision}`, { headers: { Cookie: cookie, Origin: server.origin } });
  if (!result.ok) throw new Error('Could not export the confirmed portable project.');
  await fs.writeFile(portable, new Uint8Array(await result.arrayBuffer()), { flag: 'wx' });
  console.log(JSON.stringify({ folder, pdf, portable, revision: project.revision, pages: project.pages.length }));
} finally { await server.close(); }
