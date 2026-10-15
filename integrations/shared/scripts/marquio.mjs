#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
try {
  const config = JSON.parse(await readFile(new URL('../marquio-install.json', import.meta.url), 'utf8'));
  if (!path.isAbsolute(config.repositoryRoot)) throw new Error('Reinstall Marquio from its repository.');
  const child = spawn(process.execPath, [path.join(config.repositoryRoot, 'bin/marquio.mjs'), ...process.argv.slice(2)], { stdio: 'inherit', shell: false });
  child.once('error', error => { console.error(`Marquio: ${error.message}`); process.exitCode = 1; });
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
} catch (error) {
  console.error(`Marquio: ${error.message}. Keep the source repository and run npm run build there, or reinstall after moving it.`);
  process.exitCode = 1;
}
