import { it, expect } from "vitest";
import { createProject, type DocumentNode } from "../../src/core/project";
import { preflight } from "../../src/render/preflight";
it("locates overflow, missing fonts, transformed descendants and invalid projections", () => {
  const p = createProject("Proof");
  const base = {
    name: "Object",
    transform: {
      x: 1900,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    opacity: 1,
    visible: true,
    locked: false,
    origin: { kind: "fixture" as const },
    approval: { status: "approved" as const },
  };
  const text: DocumentNode = {
    ...base,
    id: "text",
    type: "text",
    text: "Overflow",
    style: {
      fontFamily: "Missing",
      fontSize: 40,
      fontWeight: 400,
      fontStyle: "normal",
      lineHeight: 1.2,
      letterSpacing: 0,
      color: "#000000",
      align: "left",
      verticalAlign: "top",
    },
  };
  p.pages = [
    {
      id: "page",
      sectionId: p.sections[0].id,
      title: "Page",
      width: 1920,
      height: 1080,
      background: "#ffffff",
      nodes: [
        {
          ...base,
          id: "group",
          type: "group",
          transform: { ...base.transform, x: 0 },
          children: [text],
        },
        {
          ...base,
          id: "mockup",
          type: "mockup",
          template: "custom",
          quad: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 3, y: 0 },
          ],
          children: [],
        },
      ],
    },
  ];
  expect(
    preflight(p, {
      text: {
        width: 100,
        height: 200,
        scrollHeight: 200,
        scrollWidth: 100,
        overflow: true,
        fontAvailable: false,
      },
    }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "outside-page",
        path: "pages.0.nodes.0.children.0",
      }),
      expect.objectContaining({
        code: "text-overflow",
        path: "pages.0.nodes.0.children.0",
      }),
      expect.objectContaining({
        code: "font-substitution",
        path: "pages.0.nodes.0.children.0",
      }),
      expect.objectContaining({
        code: "invalid-projection",
        path: "pages.0.nodes.1",
      }),
    ]),
  );
  text.visible = false;
  expect(
    preflight(p, new Map()).filter((d) => d.path.includes("children")),
  ).toEqual([]);
});
