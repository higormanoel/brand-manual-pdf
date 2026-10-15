import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export type AgentHost = 'codex' | 'claude';
export interface InstallOptions { agent: AgentHost; targetRoot: string; overwrite?: boolean; repositoryRoot?: string }
export interface InstallReport { agent: AgentHost; directory: string; repositoryRoot: string; launcher: string }
function missing(error: unknown) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
/** Resolve the selected root, including a not-yet-created suffix, without creating anything. */
async function canonicalRoot(input: string): Promise<string> {
  let ancestor = path.resolve(input);
  const suffix: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(ancestor);
      if (!(await fs.stat(real)).isDirectory()) throw new Error(`Installation root is not a directory: ${ancestor}`);
      return path.join(real, ...suffix);
    } catch (error) {
      if (!missing(error)) throw error;
      // A dangling root/ancestor link is not a missing directory that we may create.
      try { if ((await fs.lstat(ancestor)).isSymbolicLink()) throw new Error(`Symlink has no valid installation root: ${ancestor}`); }
      catch (statError) { if (!missing(statError)) throw statError; }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.unshift(path.basename(ancestor)); ancestor = parent;
    }
  }
}
/** Existing components below the explicitly selected root may never redirect writes. */
async function validateDestination(root: string, components: string[]): Promise<void> {
  let current = root;
  for (const component of components) {
    current = path.join(current, component);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Symlink in installation destination: ${current}`);
      if (!stat.isDirectory()) throw new Error(`Installation destination is not a directory: ${current}`);
    } catch (error) { if (missing(error)) return; throw error; }
  }
}
/** Install only into the caller-selected root. No home discovery or global configuration changes. */
export async function installAgent(options: InstallOptions): Promise<InstallReport> {
  if (options.agent !== 'codex' && options.agent !== 'claude') throw new Error('Unknown agent; choose codex or claude.');
  if (!options.targetRoot) throw new Error('An explicit target root is required.');
  const repositoryRoot = path.resolve(options.repositoryRoot ?? fileURLToPath(new URL('../../', import.meta.url)));
  const source = path.join(repositoryRoot, 'integrations');
  await fs.access(path.join(repositoryRoot, 'bin/marquio.mjs'));
  await fs.access(path.join(source, options.agent, 'SKILL.md'));
  const targetRoot = await canonicalRoot(options.targetRoot);
  const components = [options.agent === 'codex' ? '.agents' : '.claude', 'skills', 'marquio'];
  await validateDestination(targetRoot, components);
  const directory = path.join(targetRoot, ...components);
  await fs.mkdir(path.dirname(directory), { recursive: true });
  await validateDestination(targetRoot, components);
  try { await fs.mkdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!options.overwrite) throw new Error(`Skill already exists: ${directory}. Use --force to replace it.`);
    await validateDestination(targetRoot, components);
    await fs.rm(directory, { recursive: true, force: true });
    await fs.mkdir(directory);
  }
  try {
    await fs.cp(path.join(source, 'shared'), directory, { recursive: true });
    await fs.cp(path.join(source, options.agent), directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'marquio-install.json'), JSON.stringify({ repositoryRoot, agent: options.agent }, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    await validateDestination(targetRoot, components);
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
  return { agent: options.agent, directory, repositoryRoot, launcher: path.join(directory, 'scripts/marquio.mjs') };
}
