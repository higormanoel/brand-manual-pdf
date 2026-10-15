import type { DocumentNode, NodeTransform, Point } from "../../core/nodes";
import { transformMatrix, transformPoint } from "../../core/geometry";
/** Containers retain their intrinsic local coordinate system. Their children,
 * projected quad, scene, masks and overlays all inherit this one scale. */
export function nodeDimensions(node: DocumentNode): {
  width: number;
  height: number;
} {
  const t = node.transform;
  return node.type === "group" || node.type === "mockup"
    ? {
        width: t.width * Math.abs(t.scaleX),
        height: t.height * Math.abs(t.scaleY),
      }
    : { width: t.width, height: t.height };
}
/** Dimensions are measured along the node axes, before ancestor transforms.
 * The opposite anchor stays at the identical point in the parent's space. */
export function resizeTransform(
  node: DocumentNode,
  size: { width: number; height: number },
  anchor: Point = { x: 0, y: 0 },
): NodeTransform {
  if (![size.width, size.height].every((n) => Number.isFinite(n) && n > 0))
    throw new Error("O tamanho deve ser positivo.");
  const t = node.transform;
  const container = node.type === "group" || node.type === "mockup";
  const next = {
    ...t,
    ...(container
      ? {
          scaleX: ((t.scaleX < 0 ? -1 : 1) * size.width) / t.width,
          scaleY: ((t.scaleY < 0 ? -1 : 1) * size.height) / t.height,
        }
      : size),
  };
  const oldPoint = transformPoint(
    { x: t.width * anchor.x, y: t.height * anchor.y },
    transformMatrix({ ...t, x: 0, y: 0 }),
  );
  const newPoint = transformPoint(
    { x: next.width * anchor.x, y: next.height * anchor.y },
    transformMatrix({ ...next, x: 0, y: 0 }),
  );
  return {
    ...next,
    x: t.x + oldPoint.x - newPoint.x,
    y: t.y + oldPoint.y - newPoint.y,
  };
}
