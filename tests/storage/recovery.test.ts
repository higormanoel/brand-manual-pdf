import { afterEach, describe, expect, it } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { createProject } from '../../src/core/project';
import { RecoveryStore } from '../../src/storage/recovery';
let store: RecoveryStore | undefined;
afterEach(() => store?.close());
describe('browser recovery', () => {
  it('retains pending command payloads and original bytes independently of later caller mutations', async () => {
    store = await RecoveryStore.open({ indexedDB, name: `recovery-${crypto.randomUUID()}` });
    const project = createProject('Pending'); const bytes = new Uint8Array([1, 3, 8]);
    await store.save({ project, assets: { 'assets/image': bytes }, pending: [{ commandId: 'pending', expectedRevision: 0, commands: [{ type: 'project.update', patch: { title: 'Edited' } }] }], confirmedRevision: 0, mode: 'local' });
    bytes[0] = 99; project.title = 'Mutated';
    const recovered = await store.load(project.id); expect(recovered).toMatchObject({ status: 'pending', version: 1, project: { title: 'Pending' } });
    expect(recovered!.pending[0].commandId).toBe('pending'); expect([...recovered!.assets['assets/image']]).toEqual([1, 3, 8]);
    expect(await store.load('unknown')).toBeUndefined();
  });
  it('separates browser-only data from acknowledged disk revisions and clears only the chosen project', async () => {
    store = await RecoveryStore.open({ indexedDB, name: `recovery-${crypto.randomUUID()}` });
    const first = createProject('Browser'); const second = createProject('Disk');
    expect((await store.save({ project: first, assets: {}, pending: [], confirmedRevision: null, mode: 'browser-only' })).status).toBe('browser-only');
    expect((await store.save({ project: second, assets: {}, pending: [], confirmedRevision: 0, mode: 'local' })).status).toBe('disk-confirmed');
    await expect(store.save({ project: second, assets: {}, pending: [], confirmedRevision: 5, mode: 'local' })).rejects.toThrow(/revision/i);
    await store.clear(first.id); expect(await store.load(first.id)).toBeUndefined(); expect((await store.load(second.id))?.status).toBe('disk-confirmed');
  });
});
