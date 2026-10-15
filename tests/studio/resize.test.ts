import { it, expect } from "vitest";
import type { GroupNode, ShapeNode } from "../../src/core/nodes";
import {
  transformPoint,
  transformMatrix,
  worldMatrix,
} from "../../src/core/geometry";
import {
  nodeDimensions,
  resizeTransform,
} from "../../src/studio/editor/resize";
const node: GroupNode = {
  id: "g",
  name: "g",
  type: "group",
  opacity: 1,
  visible: true,
  locked: false,
  origin: { kind: "manual" },
  approval: { status: "pending" },
  transform: {
    x: 130,
    y: 170,
    width: 200,
    height: 100,
    rotation: 32,
    scaleX: -1.5,
    scaleY: 0.75,
  },
  children: [],
};
it("keeps local contents intact and the opposite anchor fixed through rotated nonuniform ancestors", () => {
  const original = structuredClone(node);
  const next = resizeTransform(
    node,
    { width: 600, height: 150 },
    { x: 1, y: 1 },
  );
  const parent = {
    x: 200,
    y: 300,
    width: 1000,
    height: 1000,
    rotation: 21,
    scaleX: 1.2,
    scaleY: 0.8,
  };
  const before = transformPoint(
    { x: 200, y: 100 },
    worldMatrix([parent, node.transform]),
  );
  const after = transformPoint({ x: 200, y: 100 }, worldMatrix([parent, next]));
  expect(after.x).toBeCloseTo(before.x, 10);
  expect(after.y).toBeCloseTo(before.y, 10);
  expect(next.scaleX).toBe(-3);
  expect(next.scaleY).toBe(1.5);
  expect(next.width).toBe(200);
  expect(next.height).toBe(100);
  expect(node).toEqual(original);
  expect(nodeDimensions({ ...node, transform: next })).toEqual({
    width: 600,
    height: 150,
  });
});
it("resizes ordinary geometry and keeps the opposite rotated corner fixed", () => {
  const shape: ShapeNode = {
    ...node,
    type: "shape",
    shape: "rectangle",
    style: { fill: "#000000", stroke: "none", strokeWidth: 0, cornerRadius: 0 },
  };
  const next = resizeTransform(
    shape,
    { width: 500, height: 250 },
    { x: 1, y: 1 },
  );
  const before = transformPoint(
      { x: 200, y: 100 },
      transformMatrix(shape.transform),
    ),
    after = transformPoint({ x: 500, y: 250 }, transformMatrix(next));
  expect(after.x).toBeCloseTo(before.x, 10);
  expect(after.y).toBeCloseTo(before.y, 10);
  expect(next.scaleX).toBe(-1.5);
  expect(next.width).toBe(500);
});
