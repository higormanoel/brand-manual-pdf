import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { ProjectRepository } from '../../src/storage/repository';
import { createProject } from '../../src/core/project';

// Break caught: two reclaimers see one dead owner, then the delayed reclaimer removes the new live owner's lock.
it('allows only one durable commit after two independent processes observe a dead legacy owner', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marquio-dead-owner-'));
  const children: ReturnType<typeof spawn>[] = [];
  const waitFor = async (name: string) => { const start = Date.now(); for (;;) { try { await fs.stat(path.join(dir, name)); return; } catch { if (Date.now() - start > 7000) throw new Error(`Timeout: ${name}`); await new Promise(resolve => setTimeout(resolve, 5)); } } };
  try {
    await ProjectRepository.open(dir, { project: createProject('Before') });
    const worker = path.join(dir, 'contender.mjs');
    await build({ stdin: { resolveDir: process.cwd(), contents: `import fs from 'node:fs/promises'; import path from 'node:path'; import {ProjectRepository} from './src/storage/repository';
const folder=process.argv[2], id=process.argv[3], other=id==='cli'?'studio':'cli'; const repo=await ProjectRepository.open(folder);
const read=fs.readFile.bind(fs), write=fs.writeFile.bind(fs), remove=fs.rm.bind(fs), stat=fs.stat.bind(fs); let legacyObserved=false;
const wait=async(name)=>{const start=Date.now();for(;;){try{await stat(path.join(folder,name));return;}catch{if(Date.now()-start>7000)throw new Error('Timeout '+name);await new Promise(r=>setTimeout(r,5));}}};
fs.readFile=async(...args)=>{const value=await read(...args);const name=String(args[0]);
if(name.endsWith('.marquio-write-lock/owner.json')&&JSON.parse(String(value)).pid===99999999){legacyObserved=true;await write(path.join(folder,id+'.seen'),'');await wait(other+'.seen');}
if(legacyObserved&&name.endsWith('project.marquio.json')){await write(path.join(folder,id+'.state'),'');if(id==='cli')await wait('studio.state');}
return value;};
fs.rm=async(...args)=>{if(String(args[0])===path.join(folder,'.marquio-write-lock')&&legacyObserved&&id==='studio')await wait('cli.owns-lock');return remove(...args);};
fs.writeFile=async(...args)=>{const result=await write(...args);if(String(args[0]).endsWith('.marquio-write-lock/owner.json')&&legacyObserved&&id==='cli')await write(path.join(folder,'cli.owns-lock'),'');return result;};
await write(path.join(folder,id+'.ready'),'');await wait('go');
try{const ack=await repo.commit({commandId:id,expectedRevision:0,commands:[{type:'project.update',patch:{title:id}}]});console.log(JSON.stringify({revision:ack.revision,id}));}catch(error){console.log(JSON.stringify({code:error.code,id}));}` }, outfile: worker, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
    const run = (id: string) => new Promise<{ revision?: number; code?: string; id: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [worker, dir, id]); children.push(child); let stdout = ''; let stderr = '';
      child.stdout!.on('data', data => { stdout += data; }); child.stderr!.on('data', data => { stderr += data; }); child.on('error', reject); child.on('exit', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(stderr)));
    });
    const first = run('cli'); const second = run('studio');
    await Promise.all([waitFor('cli.ready'), waitFor('studio.ready')]);
    await fs.mkdir(path.join(dir, '.marquio-write-lock')); await fs.writeFile(path.join(dir, '.marquio-write-lock/owner.json'), JSON.stringify({ pid: 99999999 })); await fs.writeFile(path.join(dir, 'go'), '');
    const results = await Promise.all([first, second]);
    expect(results.filter(result => result.revision === 1)).toHaveLength(1); expect(results.filter(result => result.code === 'revision-conflict')).toHaveLength(1);
    const winner = results.find(result => result.revision === 1)!;
    const reopened = await ProjectRepository.open(dir); expect((await reopened.load()).title).toBe(winner.id);
    const retry = await reopened.commit({ commandId: winner.id, expectedRevision: 0, commands: [{ type: 'project.update', patch: { title: winner.id } }] }); expect(retry.revision).toBe(1);
    // There is no shared lock release/reclaim: the dead legacy marker is left untouched.
    expect(JSON.parse(await fs.readFile(path.join(dir, '.marquio-write-lock/owner.json'), 'utf8')).pid).toBe(99999999);
  } finally { for (const child of children) if (child.exitCode === null) child.kill('SIGKILL'); await fs.rm(dir, { recursive: true, force: true }); }
}, 15000);
