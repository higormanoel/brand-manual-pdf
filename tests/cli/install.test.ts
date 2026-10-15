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
  expect(codex.directory).toBe(path.join(await fs.realpath(root), '.agents/skills/marquio'));
  expect(claude.directory).toBe(path.join(await fs.realpath(root), '.claude/skills/marquio'));
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
for (const agent of ['codex', 'claude'] as const) {
  const host = agent === 'codex' ? '.agents' : '.claude';
  for (const redirected of ['host', 'skills', 'leaf'] as const) {
    for (const overwrite of [false, true]) test(`${agent} rejects a redirected ${redirected} destination (force=${overwrite}) and preserves external bytes`, async () => {
      const root = await temp();
      const targetRoot = path.join(root, 'target');
      const external = path.join(root, 'external');
      const externalSkill = path.join(external, 'skills/marquio');
      await fs.mkdir(externalSkill, { recursive: true });
      await fs.mkdir(targetRoot);
      const marker = path.join(externalSkill, 'keep.txt');
      await fs.writeFile(marker, 'external custom data');
      let link: string;
      let destination: string;
      if (redirected === 'host') { link = path.join(targetRoot, host); destination = external; }
      else if (redirected === 'skills') {
        await fs.mkdir(path.join(targetRoot, host));
        link = path.join(targetRoot, host, 'skills'); destination = path.join(external, 'skills');
      } else {
        await fs.mkdir(path.join(targetRoot, host, 'skills'), { recursive: true });
        link = path.join(targetRoot, host, 'skills/marquio'); destination = externalSkill;
      }
      await fs.symlink(destination, link, 'dir');
      await expect(installAgent({ agent, targetRoot, overwrite })).rejects.toThrow(/symlink/i);
      expect(await fs.readFile(marker, 'utf8')).toBe('external custom data');
      expect(await fs.readlink(link)).toBe(destination);
      await expect(fs.access(path.join(externalSkill, 'SKILL.md'))).rejects.toThrow();
    });
  }
  test(`${agent} rejects redirected ancestors before creating a missing external skill`, async () => {
    const root = await temp();
    const targetRoot = path.join(root, 'target'); const external = path.join(root, 'external');
    await fs.mkdir(targetRoot); await fs.mkdir(external);
    const link = path.join(targetRoot, host);
    await fs.symlink(external, link, 'dir');
    await expect(installAgent({ agent, targetRoot, overwrite: true })).rejects.toThrow(/symlink/i);
    expect(await fs.readdir(external)).toEqual([]);
    expect(await fs.readlink(link)).toBe(external);
  });
}
test('canonicalizes an explicitly selected root alias without rejecting source or root symlinks', async () => {
  const root = await temp(); const actual = path.join(root, 'actual'); const alias = path.join(root, 'chosen alias');
  await fs.mkdir(actual); await fs.symlink(actual, alias, 'dir');
  const installed = await installAgent({ agent: 'codex', targetRoot: alias });
  expect(installed.directory).toBe(path.join(await fs.realpath(actual), '.agents/skills/marquio'));
  expect(await fs.readlink(alias)).toBe(actual);
});
