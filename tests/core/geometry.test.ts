import { describe, expect, it } from 'vitest';
import { documentToScreen, screenToDocument, localToDocument, documentToLocal, nodeBounds, alignmentDeltas, distributionDeltas } from '../../src/core/geometry';
import type { NodeTransform } from '../../src/core/nodes';
const t = (patch: Partial<NodeTransform> = {}): NodeTransform => ({ x: 0, y: 0, width: 100, height: 50, rotation: 0, scaleX: 1, scaleY: 1, ...patch });
// Break caught: pan and zoom must invert in the same order as rendering, including rotated ancestors.
describe('coordinate contract', () => {
  it('converts screen through zoom and nested rotated groups to local coordinates', () => {
    const ancestors = [t({ x: 100, y: 50, rotation: 90, scaleX: 2, scaleY: 2 }), t({ x: 10, y: 20, rotation: -90 })];
    expect(localToDocument({ x: 5, y: 7 }, ancestors).x).toBeCloseTo(70);
    expect(localToDocument({ x: 5, y: 7 }, ancestors).y).toBeCloseTo(84);
    expect(documentToScreen({ x: 70, y: 84 }, { x: 30, y: -10, zoom: 2 })).toEqual({ x: 170, y: 158 });
    const local = documentToLocal(screenToDocument({ x: 170, y: 158 }, { x: 30, y: -10, zoom: 2 }), ancestors);
    expect(local.x).toBeCloseTo(5); expect(local.y).toBeCloseTo(7);
  });
  it('bounds all four rotated corners instead of unrotated dimensions', () => {
    const bounds = nodeBounds(t({ x: 100, y: 20, rotation: 90 }));
    expect(bounds.x).toBeCloseTo(50); expect(bounds.y).toBeCloseTo(20);
    expect(bounds.width).toBeCloseTo(50); expect(bounds.height).toBeCloseTo(100);
  });
  it('rejects singular inverses and unusable zoom', () => {
    expect(() => documentToLocal({ x: 1, y: 1 }, [t({ scaleX: 0 })])).toThrow(/singular/i);
    expect(() => screenToDocument({ x: 1, y: 1 }, { x: 0, y: 0, zoom: 0 })).toThrow();
  });
  it('aligns document bounds of nodes inside different coordinate systems', () => {
    const items = [
      { id: 'a', transform: t({ x: 10, y: 20, rotation: 90 }), ancestors: [] },
      { id: 'b', transform: t({ x: 5, y: 5 }), ancestors: [t({ x: 200, y: 0, scaleX: 2 })] },
    ];
    expect(alignmentDeltas(items, 'left')).toEqual([{ id: 'a', delta: { x: 0, y: 0 } }, { id: 'b', delta: { x: -250, y: 0 } }]);
  });
  it('distributes equal document gaps while retaining the endpoints', () => {
    const items = [0, 50, 200].map((x, i) => ({ id: String(i), transform: t({ x, width: 20 }), ancestors: [] }));
    expect(distributionDeltas(items, 'horizontal')).toEqual([{ id: '0', delta: { x: 0, y: 0 } }, { id: '1', delta: { x: 50, y: 0 } }, { id: '2', delta: { x: 0, y: 0 } }]);
  });
});
it('distributes vertically in document space and leaves fewer than three nodes in place', () => {
  const items = [0, 40, 200].map((y, i) => ({ id: String(i), transform: t({ y, height: 20 }), ancestors: [t({ scaleY: 2 })] }));
  expect(distributionDeltas(items, 'vertical')).toEqual([{ id: '0', delta: { x: 0, y: 0 } }, { id: '1', delta: { x: 0, y: 120 } }, { id: '2', delta: { x: 0, y: 0 } }]);
  expect(distributionDeltas(items.slice(0, 2), 'vertical')).toEqual([{ id: '0', delta: { x: 0, y: 0 } }, { id: '1', delta: { x: 0, y: 0 } }]);
  expect(alignmentDeltas([], 'left')).toEqual([]);
});
