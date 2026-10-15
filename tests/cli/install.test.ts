import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { afterEach, expect, test } from 'vitest';
import { installAgent } from '../../src/cli/install';
import { ProjectRepository } from '../../src/storage/repository';
const run = promisify(execFile);
const temporary: string[] = [];
async function temp() { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio install spaces ')); temporary.push(root); return root; }
afterEach(async () => { await Promise.all(temporary.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
test('installs host-specific folders and preserves an existing skill unless force is explicit', async () => {
  const root = await temp();
  const codex = await installAgent({ agent: 'codex', targetRoot: root });
  const claude = await installAgent({ agent: 'claude', targetRoot: root });
  expect(codex.directory).toBe(path.join(root, '.agents/skills/marquio'));
  expect(claude.directory).toBe(path.join(root, '.claude/skills/marquio'));
  await fs.writeFile(path.join(codex.directory, 'SKILL.md'), 'user custom skill');
  await expect(installAgent({ agent: 'codex', targetRoot: root })).rejects.toThrow(/exist/i);
  expect(await fs.readFile(path.join(codex.directory, 'SKILL.md'), 'utf8')).toBe('user custom skill');
  await installAgent({ agent: 'codex', targetRoot: root, overwrite: true });
  expect(await fs.readFile(path.join(codex.directory, 'SKILL.md'), 'utf8')).toContain('name: marquio');
});
test('both adapters invoke the canonical CLI from another cwd and confirm the same repository revision', async () => {
  const root = await temp();
  const repositoryRoot = path.join(root, 'canonical repo with spaces');
  await fs.mkdir(repositoryRoot);
  // A symlink gives the real built CLI a path with spaces, without copying dependencies or touching home.
  for (const entry of ['bin', 'dist', 'integrations']) await fs.symlink(path.resolve(entry), path.join(repositoryRoot, entry), 'dir');
  const projectFolder = path.join(root, 'client project');
  const repo = await ProjectRepository.open(projectFolder);
  await repo.commit({ commandId: 'setup', expectedRevision: 0, commands: [{ type: 'project.update', patch: { title: 'Canonical revision' } }] });
  for (const agent of ['codex', 'claude'] as const) {
    const installed = await installAgent({ agent, targetRoot: path.join(root, 'installed targets'), repositoryRoot });
    const result = await run(process.execPath, [path.join(installed.directory, 'scripts/marquio.mjs'), 'validate', projectFolder], { cwd: root });
    expect(JSON.parse(result.stdout)).toMatchObject({ valid: true, revision: 1 });
    const metadata = JSON.parse(await fs.readFile(path.join(installed.directory, 'marquio-install.json'), 'utf8'));
    expect(metadata.repositoryRoot).toBe(repositoryRoot);
  }
});
test('adapter reference contracts keep optional intake and revision-safe editing explicit', async () => {
  const root = await temp();
  for (const agent of ['codex', 'claude'] as const) {
    const installed = await installAgent({ agent, targetRoot: root });
    const skill = await fs.readFile(path.join(installed.directory, 'SKILL.md'), 'utf8');
    const workflow = await fs.readFile(path.join(installed.directory, 'references/workflow.md'), 'utf8');
    expect(skill).toMatch(/name: marquio/);
    for (const contract of ['expectedRevision', 'commandId', 'skipped', 'pending', 'Studio', 'import-asset', 'apply', 'generate', 'validate', 'export']) expect(skill + workflow).toContain(contract);
  }
});
