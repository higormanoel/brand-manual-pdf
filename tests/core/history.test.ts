import { expect, it } from 'vitest';
import { createHistory } from '../../src/core/history';
import { createProject } from '../../src/core/project';
import type { DocumentNode } from '../../src/core/nodes';
// Break caught: undo must restore document data and order; immutable snapshots must not retain unknown binary fields.
it('undoes and redoes text, rotation, crop and paint order, then clears a branched redo', () => {
  const p = createProject('Aurora');
  p.assets = [{ id: 'asset', name: 'Logo', mimeType: 'image/png', path: 'assets/logo.png', hash: 'a'.repeat(64), origin: { kind: 'manual' } }];
  const common = { name: 'Objeto', transform: { x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1 }, opacity: 1, visible: true, locked: false, origin: { kind: 'manual' as const }, approval: { status: 'pending' as const } };
  const nodes: DocumentNode[] = [
    { ...common, id: 'text', type: 'text', text: 'Antes', style: { fontFamily: 'Inter', fontSize: 24, fontWeight: 400, fontStyle: 'normal', lineHeight: 1.2, letterSpacing: 0, color: '#000000', align: 'left', verticalAlign: 'top' } },
    { ...common, id: 'image', type: 'image', assetId: 'asset', fit: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
  ];
  p.pages = [{ id: 'p', sectionId: p.sections[0].id, title: 'Capa', width: 1920, height: 1080, background: '#FFFFFF', nodes }];
  const history = createHistory(p);
  history.execute([
    { type: 'node.update', pageId: 'p', nodeId: 'text', patch: { text: 'Depois', transform: { rotation: 45 } } },
    { type: 'node.update', pageId: 'p', nodeId: 'image', patch: { crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 } } },
    { type: 'node.reorder', pageId: 'p', nodeId: 'image', index: 0 },
  ]);
  expect(history.current.pages[0].nodes[0].id).toBe('image'); expect(history.canUndo).toBe(true);
  expect(history.undo().pages).toEqual(p.pages); expect(history.canRedo).toBe(true);
  const redo = history.redo(); expect(redo.pages[0].nodes[1]).toMatchObject({ text: 'Depois', transform: { rotation: 45 } });
  expect(redo.pages[0].nodes[0]).toMatchObject({ crop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 } });
  history.undo(); history.execute([{ type: 'project.update', patch: { title: 'Ramo' } }]);
  expect(history.canRedo).toBe(false); expect(history.redo().title).toBe('Ramo');
  expect(p.title).toBe('Aurora');
});
it('keeps immutable validated manifest snapshots without binary data or caller references', () => {
  const p = createProject('Aurora');
  const bytes = new Uint8Array([1, 2, 3]);
  p.assets = [{ id: 'asset', name: 'Logo', mimeType: 'image/png', path: 'assets/logo.png', hash: 'a'.repeat(64), origin: { kind: 'manual' }, ...{ bytes } }];
  const history = createHistory(p);
  p.title = 'Outside'; bytes[0] = 99;
  expect(history.current.title).toBe('Aurora'); expect(history.current.assets[0]).not.toHaveProperty('bytes');
  expect(() => { history.current.title = 'Mutation'; }).toThrow();
  expect(() => history.execute([{ type: 'project.update', patch: { title: '' } }])).toThrow();
  expect(history.canUndo).toBe(false); expect(history.current.title).toBe('Aurora');
});
it('leaves undo/redo intact when an edit fails or is a no-op', () => {
  const h = createHistory(createProject('Aurora'));
  expect(h.undo().title).toBe('Aurora'); expect(h.canUndo).toBe(false);
  h.execute([{ type: 'project.update', patch: { title: 'Editado' } }]); h.undo();
  h.execute([]); expect(h.canRedo).toBe(true);
  expect(() => h.execute([{ type: 'project.update', patch: { title: '' } }])).toThrow();
  expect(h.canRedo).toBe(true); expect(h.redo().title).toBe('Editado');
});
