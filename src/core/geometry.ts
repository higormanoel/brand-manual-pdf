import type { NodeTransform, Point } from './nodes';

/** SVG-compatible affine matrix [a,b,c,d,e,f], acting on column vectors. */
export type Matrix = readonly [number, number, number, number, number, number];
export interface Viewport { x: number; y: number; zoom: number }
export interface Bounds { x: number; y: number; width: number; height: number }
export interface GeometryItem { id: string; transform: NodeTransform; ancestors?: NodeTransform[] }
export interface NodeDelta { id: string; delta: Point }
export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiplyMatrices(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function invertMatrix(m: Matrix): Matrix {
  const determinant = m[0]*m[3]-m[1]*m[2];
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) throw new Error('Cannot invert singular transform');
  return [m[3]/determinant, -m[1]/determinant, -m[2]/determinant, m[0]/determinant, (m[2]*m[5]-m[3]*m[4])/determinant, (m[1]*m[4]-m[0]*m[5])/determinant];
}
export function transformPoint(point: Point, m: Matrix): Point {
  return { x: m[0]*point.x+m[2]*point.y+m[4], y: m[1]*point.x+m[3]*point.y+m[5] };
}
/** x/y locate the local origin. Rotation is in degrees about that top-left origin. */
export function transformMatrix(t: NodeTransform): Matrix {
  const radians = t.rotation*Math.PI/180, c = Math.cos(radians), s = Math.sin(radians);
  return [c*t.scaleX, s*t.scaleX, -s*t.scaleY, c*t.scaleY, t.x, t.y];
}
export function worldMatrix(transforms: NodeTransform[]): Matrix {
  return transforms.reduce<Matrix>((parent, transform) => multiplyMatrices(parent, transformMatrix(transform)), IDENTITY);
}
export function localToDocument(point: Point, transforms: NodeTransform[]): Point {
  return transformPoint(point, worldMatrix(transforms));
}
export function documentToLocal(point: Point, transforms: NodeTransform[]): Point {
  return transformPoint(point, invertMatrix(worldMatrix(transforms)));
}
/** A document delta is a vector, so the inverse translation is deliberately excluded. */
export function documentDeltaToLocal(delta: Point, ancestors: NodeTransform[]): Point {
  const inverse = invertMatrix(worldMatrix(ancestors));
  return { x: inverse[0]*delta.x+inverse[2]*delta.y, y: inverse[1]*delta.x+inverse[3]*delta.y };
}
function viewportMatrix(viewport: Viewport): Matrix {
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0 || !Number.isFinite(viewport.x) || !Number.isFinite(viewport.y)) throw new Error('Invalid viewport');
  return [viewport.zoom, 0, 0, viewport.zoom, viewport.x, viewport.y];
}
export function documentToScreen(point: Point, viewport: Viewport): Point { return transformPoint(point, viewportMatrix(viewport)); }
export function screenToDocument(point: Point, viewport: Viewport): Point { return transformPoint(point, invertMatrix(viewportMatrix(viewport))); }
export function nodeBounds(transform: NodeTransform, ancestors: NodeTransform[] = []): Bounds {
  const matrix = worldMatrix([...ancestors, transform]);
  const corners = [{ x: 0, y: 0 }, { x: transform.width, y: 0 }, { x: transform.width, y: transform.height }, { x: 0, y: transform.height }].map(point => transformPoint(point, matrix));
  const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
  return { x, y, width: Math.max(...corners.map(p => p.x))-x, height: Math.max(...corners.map(p => p.y))-y };
}
export function unionBounds(bounds: Bounds[]): Bounds {
  if (!bounds.length) throw new Error('Bounds require at least one item');
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y));
  return { x, y, width: Math.max(...bounds.map(b => b.x+b.width))-x, height: Math.max(...bounds.map(b => b.y+b.height))-y };
}
export function alignmentDeltas(items: GeometryItem[], alignment: Alignment, target?: Bounds): NodeDelta[] {
  if (!items.length) return [];
  const bounds = items.map(item => nodeBounds(item.transform, item.ancestors));
  const reference = target ?? unionBounds(bounds);
  const value = (b: Bounds) => ({ left: b.x, center: b.x+b.width/2, right: b.x+b.width, top: b.y, middle: b.y+b.height/2, bottom: b.y+b.height })[alignment];
  const horizontal = ['left', 'center', 'right'].includes(alignment);
  return items.map((item, i) => ({ id: item.id, delta: { x: horizontal ? value(reference)-value(bounds[i]) : 0, y: horizontal ? 0 : value(reference)-value(bounds[i]) } }));
}
export function distributionDeltas(items: GeometryItem[], axis: 'horizontal' | 'vertical'): NodeDelta[] {
  const horizontal = axis === 'horizontal';
  const entries = items.map(item => ({ item, bounds: nodeBounds(item.transform, item.ancestors) }));
  const start = (b: Bounds) => horizontal ? b.x : b.y;
  const size = (b: Bounds) => horizontal ? b.width : b.height;
  entries.sort((a, b) => start(a.bounds)-start(b.bounds));
  if (entries.length < 3) return items.map(item => ({ id: item.id, delta: { x: 0, y: 0 } }));
  const first = entries[0].bounds, last = entries[entries.length-1].bounds;
  const gap = (start(last)+size(last)-start(first)-entries.reduce((sum, e) => sum+size(e.bounds), 0))/(entries.length-1);
  const deltas = new Map<string, Point>();
  let cursor = start(first);
  entries.forEach((entry, index) => {
    const delta = index === 0 || index === entries.length-1 ? 0 : cursor-start(entry.bounds);
    deltas.set(entry.item.id, { x: horizontal ? delta : 0, y: horizontal ? 0 : delta });
    cursor += size(entry.bounds)+gap;
  });
  return items.map(item => ({ id: item.id, delta: deltas.get(item.id)! }));
}
/** Returns an equivalent R*S transform, rejecting shear that the document model cannot encode. */
export function matrixToTransform(matrix: Matrix, dimensions: Pick<NodeTransform, 'width' | 'height'>): NodeTransform {
  const [a, b, c, d, x, y] = matrix, scaleX = Math.hypot(a, b), second = Math.hypot(c, d);
  if (Math.abs(a*c+b*d) > 1e-8*Math.max(1, scaleX*second)) throw new Error('Cannot ungroup a sheared transform without changing appearance');
  const rotation = scaleX ? Math.atan2(b, a)*180/Math.PI : Math.atan2(-c, d)*180/Math.PI;
  const scaleY = scaleX ? (a*d-b*c)/scaleX : second;
  return { ...dimensions, x, y, rotation, scaleX, scaleY };
}
