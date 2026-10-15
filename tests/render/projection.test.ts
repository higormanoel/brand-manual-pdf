import { describe, it, expect } from "vitest";
import { projectToQuad } from "../../src/mockups/projection";
describe("projectToQuad", () => {
  it("maps all four unit corners to the authored node-local pixel corners", () => {
    const m = projectToQuad([
      { x: 10, y: 20 },
      { x: 90, y: 10 },
      { x: 80, y: 100 },
      { x: 20, y: 90 },
    ]);
    [
      [0, 0, 10, 20],
      [1, 0, 90, 10],
      [1, 1, 80, 100],
      [0, 1, 20, 90],
    ].forEach(([x, y, a, b]) => {
      const w = m[3] * x + m[7] * y + m[15];
      expect((m[0] * x + m[4] * y + m[12]) / w).toBeCloseTo(a, 8);
      expect((m[1] * x + m[5] * y + m[13]) / w).toBeCloseTo(b, 8);
    });
  });
  it("rejects collapsed, crossed or concave quads", () => {
    for (const quad of [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 0, y: 2 },
      ],
    ])
      expect(() =>
        projectToQuad(quad as Parameters<typeof projectToQuad>[0]),
      ).toThrow();
  });
});
