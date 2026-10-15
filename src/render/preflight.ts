import type { BrandProject, Diagnostic } from "../core/schema";
import type { DocumentNode } from "../core/nodes";
import type { TextMeasureResult } from "./textMeasurement";
import { projectToQuad } from "../mockups/projection";
export type TextMeasurements =
  | Readonly<Record<string, TextMeasureResult>>
  | ReadonlyMap<string, TextMeasureResult>;
type Matrix = [number, number, number, number, number, number];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
/** Paths identify the persisted page/node, including nested descendants. No clipping is silently repaired. */
export function preflight(
  project: BrandProject,
  measurements: TextMeasurements,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const measured = (id: string): TextMeasureResult | undefined =>
    measurements instanceof Map
      ? measurements.get(id)
      : (measurements as Readonly<Record<string, TextMeasureResult>>)[id];
  project.pages.forEach((page, pageIndex) => {
    const walk = (nodes: DocumentNode[], path: string, parent: Matrix) =>
      nodes.forEach((node, index) => {
        if (!node.visible) return;
        const p = `${path}.${index}`,
          t = node.transform,
          r = (t.rotation * Math.PI) / 180;
        const matrix = multiply(parent, [
          Math.cos(r) * t.scaleX,
          Math.sin(r) * t.scaleX,
          -Math.sin(r) * t.scaleY,
          Math.cos(r) * t.scaleY,
          t.x,
          t.y,
        ]);
        const add = (
          code: Diagnostic["code"],
          message: string,
          severity: Diagnostic["severity"] = "error",
        ) =>
          diagnostics.push({
            code,
            severity,
            path: p,
            message: `${page.title} / ${node.name}: ${message}`,
          });
        const corners = [
          [0, 0],
          [t.width, 0],
          [t.width, t.height],
          [0, t.height],
        ].map(([x, y]) => ({
          x: matrix[0] * x + matrix[2] * y + matrix[4],
          y: matrix[1] * x + matrix[3] * y + matrix[5],
        }));
        if (
          corners.some(
            (c) =>
              c.x < -0.5 ||
              c.y < -0.5 ||
              c.x > page.width + 0.5 ||
              c.y > page.height + 0.5,
          )
        )
          add("outside-page", "objeto ultrapassa os limites da página.");
        if (node.type === "text") {
          const m = measured(node.id);
          if (m?.overflow || (m && m.height > t.height + 0.5))
            add(
              "text-overflow",
              "texto excede a caixa. Aumente a caixa ou continue em outra página.",
            );
          if (m && !m.fontAvailable)
            add(
              "font-substitution",
              `fonte ${node.style.fontFamily} indisponível. Carregue a fonte antes de exportar.`,
            );
        }
        if (node.type === "mockup" && node.quad) {
          try {
            projectToQuad(node.quad);
          } catch {
            add(
              "invalid-projection",
              "superfície de aplicação inválida. Ajuste os quatro cantos.",
            );
          }
        }
        if (node.type === "mockup" || node.type === "group")
          walk(node.children, `${p}.children`, matrix);
      });
    walk(page.nodes, `pages.${pageIndex}.nodes`, [1, 0, 0, 1, 0, 0]);
  });
  return diagnostics;
}
