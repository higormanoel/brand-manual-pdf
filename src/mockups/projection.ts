import type { ProjectionQuad } from "../core/nodes";

/** CSS column-major matrix3d mapping the unit square to TL/TR/BR/BL local pixels.
 * Use a 1×1 source element with transform-origin: 0 0. Node transforms remain separate.
 */
export function projectToQuad(corners: ProjectionQuad): number[] {
  if (corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    throw new Error("A projeção contém coordenadas inválidas.");
  const crosses = corners.map((p, i) => {
    const q = corners[(i + 1) % 4],
      r = corners[(i + 2) % 4];
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
  });
  if (
    crosses.some((n) => Math.abs(n) < 1e-8) ||
    !crosses.every((n) => Math.sign(n) === Math.sign(crosses[0]))
  )
    throw new Error(
      "A projeção exige quatro cantos convexos e não degenerados.",
    );
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-10) throw new Error("A projeção é degenerada.");
  const g = (dx3 * dy2 - dx2 * dy3) / det,
    h = (dx1 * dy3 - dx3 * dy1) / det;
  const a = p1.x - p0.x + g * p1.x,
    b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y,
    e = p3.y - p0.y + h * p3.y;
  return [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, p0.x, p0.y, 0, 1];
}
