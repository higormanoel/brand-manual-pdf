import "./fonts.css";
import type { CSSProperties } from "react";
import type { TextStyle } from "../core/nodes";
export interface TextMeasureRequest {
  text: string;
  style: TextStyle;
  width: number;
  height?: number;
}
export interface TextMeasureResult {
  width: number;
  height: number;
  scrollWidth: number;
  scrollHeight: number;
  overflow: boolean;
  fontAvailable: boolean;
}
export function textCSS(style: TextStyle): CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    color: style.color,
    textAlign: style.align,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    margin: 0,
    padding: 0,
    border: 0,
    boxSizing: "border-box",
  };
}
function fontDescriptor(style: TextStyle) {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${JSON.stringify(style.fontFamily)}`;
}
export async function fontAvailable(style: TextStyle): Promise<boolean> {
  try {
    await document.fonts.load(fontDescriptor(style));
    await document.fonts.ready;
  } catch {
    return false;
  }
  const family = style.fontFamily.replace(/['"]/g, "").toLowerCase();
  if (["serif", "sans-serif", "monospace", "system-ui"].includes(family))
    return true;
  for (const face of document.fonts)
    if (
      face.family.replace(/['"]/g, "").toLowerCase() === family &&
      face.status === "loaded"
    )
      return true;
  // System faces are not enumerated by FontFaceSet; compare against two distinct fallbacks.
  const ctx = document.createElement("canvas").getContext("2d")!;
  const sample = "mmmmmmmmmmWWWWiii0123456789";
  return ["monospace", "serif"].every((fallback) => {
    ctx.font = `32px ${fallback}`;
    const base = ctx.measureText(sample).width;
    ctx.font = `32px ${JSON.stringify(style.fontFamily)}, ${fallback}`;
    return Math.abs(ctx.measureText(sample).width - base) > 0.01;
  });
}
/** Browser-backed intrinsic wrapping measurement in untransformed document units. */
export async function measureText(
  request: TextMeasureRequest,
): Promise<TextMeasureResult> {
  if (
    !(request.width > 0) ||
    (request.height !== undefined && !(request.height > 0))
  )
    throw new Error("A caixa de texto exige dimensões positivas.");
  const available = await fontAvailable(request.style);
  const element = document.createElement("div");
  Object.assign(element.style, textCSS(request.style), {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: `${request.width}px`,
    height: "auto",
    visibility: "hidden",
    display: "block",
  });
  // Numeric React lengths need explicit CSS units when assigned directly to a DOM style.
  element.style.fontSize = `${request.style.fontSize}px`;
  element.style.letterSpacing = `${request.style.letterSpacing}px`;
  element.textContent = request.text || "\u200b";
  document.body.append(element);
  try {
    const bounds = element.getBoundingClientRect();
    return {
      width: bounds.width,
      height: bounds.height,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      overflow:
        (request.height !== undefined &&
          bounds.height > request.height + 0.5) ||
        element.scrollWidth > request.width + 0.5,
      fontAvailable: available,
    };
  } finally {
    element.remove();
  }
}
/** Resolve all used fonts and image decodes before capture; broken media must fail export. */
export async function waitForArtboardReady(
  root: ParentNode = document,
): Promise<void> {
  await document.fonts.ready;
  await Promise.all(
    Array.from(root.querySelectorAll("img")).map(async (img) => {
      try {
        await img.decode();
      } catch {
        throw new Error(
          `Não foi possível carregar a imagem: ${img.getAttribute("data-asset-id") || img.src}`,
        );
      }
      if (!img.naturalWidth) throw new Error(`Imagem vazia: ${img.src}`);
    }),
  );
  await document.fonts.ready;
}
