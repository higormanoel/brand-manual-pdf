import { describe, expect, it } from 'vitest';
import { applyCommands, findNode, type DocumentCommand } from '../../src/core/commands';
import { createProject, ProjectValidationError, type BrandProject, type Page } from '../../src/core/project';
import type { DocumentNode, GroupNode, ShapeNode } from '../../src/core/nodes';
import { localToDocument } from '../../src/core/geometry';
import { createHistory } from '../../src/core/history';
const shape = (id: string, x = 0, y = 0): ShapeNode => ({ id, type: 'shape', name: id, transform: { x, y, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1 }, opacity: 1, locked: false, visible: true, origin: { kind: 'manual' }, approval: { status: 'pending' }, shape: 'rectangle', style: { fill: '#FFFFFF', stroke: 'none', strokeWidth: 0, cornerRadius: 0 } });
function setup(nodes: DocumentNode[] = [shape('a', 10, 20), shape('b', 150, 70)]): BrandProject {
  const p = createProject('Aurora'); p.pages = [{ id: 'cover', title: 'Capa', sectionId: p.sections[0].id, width: 1920, height: 1080, background: '#FFFFFF', nodes }]; return p;
}
const page = (project: BrandProject, id: string): Page => ({ ...project.pages[0], id, nodes: [] });
// Break caught: edits must be atomic, protect locked gestures and preserve local group transforms and stable identities.
describe('document commands', () => {
  it('edits atomically without mutating source or advancing persisted revision', () => {
    const p = setup(); p.revision = 8;
    const after = applyCommands(p, [{ type: 'node.update', pageId: 'cover', nodeId: 'a', patch: { transform: { rotation: 30 }, name: 'Primeiro' } }]);
    expect(after.pages[0].nodes[0].transform).toMatchObject({ x: 10, y: 20, rotation: 30 }); expect(after.revision).toBe(8);
    expect(p.pages[0].nodes[0].name).toBe('a');
    expect(() => applyCommands(p, [{ type: 'project.update', patch: { title: 'Alterado' } }, { type: 'node.update', pageId: 'cover', nodeId: 'a', patch: { transform: { width: -1 } } }])).toThrow();
    expect(p.title).toBe('Aurora');
  });
  it('duplicates the entire group with explicitly supplied fresh IDs', () => {
    const group: GroupNode = { ...shape('g', 30, 40), type: 'group', children: [shape('child')] };
    const p = setup([group]);
    const after = applyCommands(p, [{ type: 'node.duplicate', pageId: 'cover', nodeId: 'g', idMap: { g: 'g2', child: 'child2' }, offset: { x: 20, y: 10 } }]);
    const clone = after.pages[0].nodes[1] as GroupNode;
    expect(clone.id).toBe('g2'); expect(clone.children[0].id).toBe('child2'); expect(clone.transform).toMatchObject({ x: 50, y: 50 });
    expect(() => applyCommands(p, [{ type: 'node.duplicate', pageId: 'cover', nodeId: 'g', idMap: { g: 'g2' } }])).toThrow();
  });
  it('groups sibling layers in paint order and preserves rotated visual positions on ungroup', () => {
    const p = setup(); p.pages[0].nodes[0].transform.rotation = 30;
    const grouped = applyCommands(p, [{ type: 'node.group', pageId: 'cover', nodeIds: ['b', 'a'], groupId: 'g', name: 'Grupo' }]);
    const g = grouped.pages[0].nodes[0] as GroupNode;
    expect(g.children.map(n => n.id)).toEqual(['a', 'b']);
    const point = localToDocument({ x: 0, y: 0 }, [g.transform, g.children[0].transform]);
    expect(point.x).toBeCloseTo(10); expect(point.y).toBeCloseTo(20);
    g.transform.rotation = 90;
    const ungrouped = applyCommands(grouped, [{ type: 'node.ungroup', pageId: 'cover', nodeId: 'g' }]);
    for (let i = 0; i < 2; i++) {
      const expected = localToDocument({ x: 70, y: 25 }, [g.transform, g.children[i].transform]);
      const actual = localToDocument({ x: 70, y: 25 }, [ungrouped.pages[0].nodes[i].transform]);
      expect(actual.x).toBeCloseTo(expected.x); expect(actual.y).toBeCloseTo(expected.y);
    }
  });
  it('moves in document coordinates through rotated parents and skips locked ancestors', () => {
    const g: GroupNode = { ...shape('g', 100, 50), type: 'group', transform: { ...shape('g').transform, x: 100, y: 50, rotation: 90, scaleX: 2, scaleY: 2 }, children: [shape('a', 10, 20)] };
    const p = setup([g]);
    const after = applyCommands(p, [{ type: 'node.move', pageId: 'cover', nodeIds: ['a'], delta: { x: 20, y: 10 }, source: 'gesture' }]);
    expect(findNode(after, 'cover', 'a')?.node.transform.x).toBeCloseTo(15);
    expect(findNode(after, 'cover', 'a')?.node.transform.y).toBeCloseTo(10);
    g.locked = true;
    const unchanged = applyCommands(p, [{ type: 'node.move', pageId: 'cover', nodeIds: ['a'], delta: { x: 20, y: 10 }, source: 'gesture' }]);
    expect(findNode(unchanged, 'cover', 'a')?.node.transform).toMatchObject({ x: 10, y: 20 });
    expect(unchanged.pages[0].nodes[0].locked).toBe(true);
    expect(() => applyCommands(p, [{ type: 'node.update', pageId: 'cover', nodeId: 'a', patch: { transform: { x: 90 } } }])).toThrow(/locked/i);
    expect(findNode(applyCommands(p, [{ type: 'node.update', pageId: 'cover', nodeId: 'a', allowLocked: true, patch: { transform: { x: 90 } } }]), 'cover', 'a')?.node.transform.x).toBe(90);
  });
  it('inserts, reorders and deletes nested nodes without breaking parent IDs', () => {
    const g: GroupNode = { ...shape('g'), type: 'group', children: [shape('a')] };
    const p = setup([g]);
    const after = applyCommands(p, [
      { type: 'node.insert', pageId: 'cover', parentId: 'g', node: shape('b'), index: 0 },
      { type: 'node.reorder', pageId: 'cover', nodeId: 'a', index: 0 },
      { type: 'node.delete', pageId: 'cover', nodeId: 'b' },
    ]);
    expect((after.pages[0].nodes[0] as GroupNode).children.map(n => n.id)).toEqual(['a']);
    expect(() => applyCommands(p, [{ type: 'node.insert', pageId: 'cover', node: shape('a') }])).toThrow();
    expect(() => applyCommands(p, [{ type: 'node.delete', pageId: 'cover', nodeId: 'missing' }])).toThrow();
    expect(() => applyCommands(p, [{ type: 'node.reorder', pageId: 'cover', nodeId: 'g', index: 20 }])).toThrow();
  });
  it('edits project data and section state while preserving skipped answers', () => {
    const p = setup(), sectionId = p.sections[0].id;
    const after = applyCommands(p, [
      { type: 'project.update', patch: { title: 'Novo', brand: { tagline: 'Com calma' }, brief: { audience: 'Cafés' }, editorial: { bodyFontFamily: 'Georgia' }, credits: { studio: 'Aurora Studio' } } },
      { type: 'section.update', sectionId, patch: { enabled: false, status: 'skipped', content: { paragraphs: ['Preservado'], rules: [], assetIds: [], colorIds: [], typographyIds: [] } } },
    ]);
    expect(after.title).toBe('Novo'); expect(after.brand.name).toBe('Aurora'); expect(after.brand.tagline).toBe('Com calma');
    expect(after.brief.audience).toBe('Cafés'); expect(after.editorial).toEqual({ displayFontFamily: 'Inter', bodyFontFamily: 'Georgia', captionFontFamily: 'Inter' });
    expect(after.credits.studio).toBe('Aurora Studio'); expect(after.sections[0].content?.paragraphs).toEqual(['Preservado']);
    const inserted = { ...p.sections[1], id: 'extra' };
    const changed = applyCommands(p, [{ type: 'section.insert', section: inserted, index: 0 }, { type: 'section.reorder', sectionId: 'extra', index: 2 }, { type: 'section.delete', sectionId: 'extra' }]);
    expect(changed.sections).toEqual(p.sections);
    expect(() => applyCommands(p, [{ type: 'section.delete', sectionId }])).toThrow();
  });
  it('edits page metadata, duplicates page descendants, reorders and deletes pages', () => {
    const p = setup();
    const cmds: DocumentCommand[] = [
      { type: 'page.insert', page: page(p, 'end') },
      { type: 'page.update', pageId: 'end', patch: { title: 'Fim', background: '#000000' } },
      { type: 'page.duplicate', pageId: 'cover', idMap: { cover: 'copy', a: 'a2', b: 'b2' } },
      { type: 'page.reorder', pageId: 'copy', index: 0 },
      { type: 'page.delete', pageId: 'cover' },
    ];
    const after = applyCommands(p, cmds);
    expect(after.pages.map(p => p.id)).toEqual(['copy', 'end']); expect(after.pages[1].title).toBe('Fim');
    expect(after.pages[0].nodes.map(n => n.id)).toEqual(['a2', 'b2']);
  });
  it('edits manifest records and rejects deletion of referenced assets atomically', () => {
    const p = setup();
    const asset = { id: 'art', name: 'Art', mimeType: 'image/png', path: 'assets/art.png', hash: 'a'.repeat(64), origin: { kind: 'provided' as const } };
    const after = applyCommands(p, [{ type: 'asset.insert', asset }, { type: 'asset.update', assetId: 'art', patch: { name: 'Logo' } }]);
    expect(after.assets[0].name).toBe('Logo');
    expect(applyCommands(after, [{ type: 'asset.delete', assetId: 'art' }]).assets).toEqual([]);
    const image: DocumentNode = { ...shape('image'), type: 'image', assetId: 'art', fit: 'cover' };
    const referenced = applyCommands(after, [{ type: 'node.insert', pageId: 'cover', node: image }]);
    expect(() => applyCommands(referenced, [{ type: 'asset.delete', assetId: 'art' }])).toThrow();
    expect(referenced.assets).toHaveLength(1);
  });
  it('appends a generated variant and requires matching observed pages to explicitly replace it', () => {
    const p = setup(), generated = page(p, 'variant');
    expect(applyCommands(p, [{ type: 'variant.install', mode: 'append', pages: [generated] }]).pages.map(p => p.id)).toEqual(['cover', 'variant']);
    const observed = structuredClone(p.pages);
    p.pages[0].nodes[0].name = 'Edição manual';
    expect(() => applyCommands(p, [{ type: 'variant.install', mode: 'replace', pages: [generated], expectedPages: observed }])).toThrow(/changed/i);
    const after = applyCommands(p, [{ type: 'variant.install', mode: 'replace', pages: [generated], expectedPages: p.pages }]);
    expect(after.pages.map(p => p.id)).toEqual(['variant']); expect(p.pages[0].nodes[0].name).toBe('Edição manual');
  });
});

// Break caught: runtime JSON cannot change identity or silently submit a patch for a different node type.
describe('runtime command safety', () => {
  it('rejects immutable and incompatible node patches instead of silently discarding them', () => {
    const p = setup();
    const invalid = [
      { type: 'node.update', pageId: 'cover', nodeId: 'a', patch: { id: 'hijacked' } },
      { type: 'node.update', pageId: 'cover', nodeId: 'a', patch: { text: 'Wrong type' } },
      { type: 'project.update', patch: { unexpected: 'lost' } },
    ];
    for (const command of invalid) expect(() => applyCommands(p, [command as DocumentCommand])).toThrow();
    expect(p.pages[0].nodes[0].id).toBe('a'); expect(p.title).toBe('Aurora');
  });
  it('rejects a replacement whose observed manual paint order is stale', () => {
    const p = setup(), second = page(p, 'second'); p.pages.push(second);
    expect(() => applyCommands(p, [{ type: 'variant.install', mode: 'replace', pages: [page(p, 'new')], expectedPages: [second, p.pages[0]] }])).toThrow(/changed/i);
    expect(p.pages.map(p => p.id)).toEqual(['cover', 'second']);
  });
  it('rejects reusing duplicate descendant IDs and invalid command discriminants', () => {
    const p = setup();
    expect(() => applyCommands(p, [{ type: 'page.duplicate', pageId: 'cover', idMap: { cover: 'copy', a: 'same', b: 'same' } }])).toThrow();
    expect(() => applyCommands(p, [{ type: 'unknown' } as unknown as DocumentCommand])).toThrow();
    expect(p.pages).toHaveLength(1);
  });
  it('rejects noncontiguous grouping and flattening transformations the model cannot represent', () => {
    const p = setup([shape('a'), shape('middle'), shape('b')]);
    expect(() => applyCommands(p, [{ type: 'node.group', pageId: 'cover', nodeIds: ['a', 'b'], groupId: 'g' }])).toThrow(/paint order/i);
    const child = shape('child'); child.transform.rotation = 30;
    const group: GroupNode = { ...shape('g'), type: 'group', children: [child] };
    group.transform.scaleX = 2;
    const grouped = setup([group]);
    expect(() => applyCommands(grouped, [{ type: 'node.ungroup', pageId: 'cover', nodeId: 'g' }])).toThrow(/shear/i);
    group.transform.scaleX = 1; group.opacity = 0.5;
    expect(() => applyCommands(grouped, [{ type: 'node.ungroup', pageId: 'cover', nodeId: 'g' }])).toThrow(/opacity/i);
    expect(group.children[0].transform.rotation).toBe(30);
  });
  it('moves parent-child selections only once and supports narrow style patches', () => {
    const group: GroupNode = { ...shape('g', 100, 50), type: 'group', children: [shape('child', 10, 20)] };
    const p = setup([group]);
    const after = applyCommands(p, [
      { type: 'node.move', pageId: 'cover', nodeIds: ['g', 'child', 'g'], delta: { x: 10, y: -5 }, source: 'keyboard' },
      { type: 'node.update', pageId: 'cover', nodeId: 'child', patch: { style: { fill: '#123456' } } },
    ]);
    expect(after.pages[0].nodes[0].transform).toMatchObject({ x: 110, y: 45 });
    const child = findNode(after, 'cover', 'child')!.node;
    expect(child.transform).toMatchObject({ x: 10, y: 20 });
    expect((child as ShapeNode).style).toEqual({ fill: '#123456', stroke: 'none', strokeWidth: 0, cornerRadius: 0 });
    expect(findNode(after, 'missing', 'child')).toBeUndefined();
  });
});

it('keeps directly locked nodes fixed during gestures and permits explicit unlocking', () => {
  const node = shape('locked', 12, 34); node.locked = true;
  const p = setup([node]);
  const after = applyCommands(p, [{ type: 'node.move', pageId: 'cover', nodeIds: ['locked'], delta: { x: 99, y: -20 }, source: 'gesture' }]);
  expect(after.pages[0].nodes[0].transform).toMatchObject({ x: 12, y: 34 });
  const unlocked = applyCommands(p, [{ type: 'node.update', pageId: 'cover', nodeId: 'locked', patch: { locked: false } }, { type: 'node.move', pageId: 'cover', nodeIds: ['locked'], delta: { x: 8, y: 6 }, source: 'keyboard' }]);
  expect(unlocked.pages[0].nodes[0].transform).toMatchObject({ x: 20, y: 40 });
});


// Break caught: persisted undo must restore historical content without rolling back storage's confirmed revision.
describe('guarded project restore', () => {
  it('restores a real older history snapshot including text, positions and asset manifests at the current revision', () => {
    const text: DocumentNode = {
      ...shape('text', 12, 34), type: 'text', text: 'Original',
      style: { fontFamily: 'Inter', fontSize: 24, fontWeight: 400, fontStyle: 'normal', lineHeight: 1.2, letterSpacing: 0, color: '#000000', align: 'left', verticalAlign: 'top' },
    };
    const p = setup([text]); p.revision = 2;
    const asset = { id: 'art', name: 'Original asset', mimeType: 'image/png', path: 'assets/art.png', hash: 'a'.repeat(64), origin: { kind: 'provided' as const } };
    p.assets = [asset];
    const history = createHistory(p);
    history.execute([
      { type: 'node.update', pageId: 'cover', nodeId: 'text', patch: { text: 'Later edit', transform: { x: 200, y: 300, rotation: 45 } } },
      { type: 'asset.update', assetId: 'art', patch: { name: 'Later asset' } },
      { type: 'asset.insert', asset: { ...asset, id: 'extra', path: 'assets/extra.png' } },
    ]);
    const current = { ...history.current, revision: 9 };
    const older = history.undo();
    expect(older.revision).toBe(2);
    const restored = applyCommands(current, [{ type: 'project.restore', project: older }]);
    expect(restored.revision).toBe(9);
    expect(restored.pages[0].nodes[0]).toMatchObject({ text: 'Original', transform: { x: 12, y: 34, rotation: 0 } });
    expect(restored.assets).toEqual([asset]);
    expect(current.pages[0].nodes[0]).toMatchObject({ text: 'Later edit', transform: { x: 200, y: 300, rotation: 45 } });
    expect(current.assets).toHaveLength(2); expect(older.revision).toBe(2);
    expect(restored.pages).not.toBe(older.pages); expect(restored.assets).not.toBe(older.assets);
    const composed = applyCommands(current, [
      { type: 'project.restore', project: older },
      { type: 'node.update', pageId: 'cover', nodeId: 'text', patch: { text: 'After restore', transform: { x: 20 } } },
    ]);
    expect(composed.revision).toBe(9);
    expect(composed.pages[0].nodes[0]).toMatchObject({ text: 'After restore', transform: { x: 20, y: 34, rotation: 0 } });
  });
  it('rejects a different project after earlier commands without mutating the current document', () => {
    const current = setup(); current.revision = 12;
    const before = structuredClone(current);
    expect(() => applyCommands(current, [
      { type: 'project.update', patch: { title: 'Pending' } },
      { type: 'project.restore', project: createProject('Other') },
    ])).toThrow(/same project/i);
    expect(current).toEqual(before);
  });
  it('validates the entire incoming snapshot before restoring it atomically', () => {
    const current = setup(); current.revision = 12;
    const invalid = structuredClone(current); invalid.revision = 1; invalid.pages[0].nodes[0].transform.width = -1;
    const before = structuredClone(current);
    expect(() => applyCommands(current, [
      { type: 'project.update', patch: { title: 'Pending' } },
      { type: 'project.restore', project: invalid },
    ])).toThrow(ProjectValidationError);
    expect(current).toEqual(before);
  });
});
