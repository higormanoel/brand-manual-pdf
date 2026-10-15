import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export type AgentHost = 'codex' | 'claude';
export interface InstallOptions { agent: AgentHost; targetRoot: string; overwrite?: boolean; repositoryRoot?: string }
export interface InstallReport { agent: AgentHost; directory: string; repositoryRoot: string; launcher: string }
/** Install only into the caller-selected root. No home discovery or global configuration changes. */
export async function installAgent(options: InstallOptions): Promise<InstallReport> {
  if (options.agent !== 'codex' && options.agent !== 'claude') throw new Error('Unknown agent; choose codex or claude.');
  if (!options.targetRoot) throw new Error('An explicit target root is required.');
  const repositoryRoot = path.resolve(options.repositoryRoot ?? fileURLToPath(new URL('../../', import.meta.url)));
  const source = path.join(repositoryRoot, 'integrations');
  await fs.access(path.join(repositoryRoot, 'bin/marquio.mjs'));
  await fs.access(path.join(source, options.agent, 'SKILL.md'));
  const directory = path.join(path.resolve(options.targetRoot), options.agent === 'codex' ? '.agents' : '.claude', 'skills', 'marquio');
  await fs.mkdir(path.dirname(directory), { recursive: true });
  try { await fs.mkdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!options.overwrite) throw new Error(`Skill already exists: ${directory}. Use --force to replace it.`);
    await fs.rm(directory, { recursive: true, force: true });
    await fs.mkdir(directory);
  }
  try {
    await fs.cp(path.join(source, 'shared'), directory, { recursive: true });
    await fs.cp(path.join(source, options.agent), directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'marquio-install.json'), JSON.stringify({ repositoryRoot, agent: options.agent }, null, 2) + '\n', { flag: 'wx' });
  } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
  return { agent: options.agent, directory, repositoryRoot, launcher: path.join(directory, 'scripts/marquio.mjs') };
}
