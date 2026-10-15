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
  // fontFamily is already CSS syntax, including quoted names and fallback lists.
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
}
function primaryFamily(value: string) {
  let quote = "",
    escaped = false,
    end = value.length;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === ",") {
      end = i;
      break;
    }
  }
  const css = value.slice(0, end).trim();
  const quoted = css.startsWith('"') || css.startsWith("'");
  const name = (quoted ? css.slice(1, -1) : css)
    .replace(/\\([\da-f]{1,6}\s?|.)/gi, (_, escape: string) =>
      /^[\da-f]/i.test(escape)
        ? String.fromCodePoint(parseInt(escape.trim(), 16) || 0xfffd)
        : escape,
    )
    .toLowerCase();
  return {
    css,
    name,
    generic:
      !quoted &&
      [
        "serif",
        "sans-serif",
        "monospace",
        "system-ui",
        "cursive",
        "fantasy",
        "ui-serif",
        "ui-sans-serif",
        "ui-monospace",
        "ui-rounded",
        "math",
        "fangsong",
      ].includes(name),
  };
}
/** Reports whether the requested primary face exists; a working fallback is still substitution. */
export async function fontAvailable(
  style: TextStyle,
  text = " ",
): Promise<boolean> {
  if (!CSS.supports("font-family", style.fontFamily)) return false;
  try {
    // Unicode-range faces load only for characters in this sample. A space loads
    // Latin alone and would let a cold Cyrillic/Greek measurement use fallback.
    await document.fonts.load(fontDescriptor(style), text || "\u200b");
    await document.fonts.ready;
  } catch {
    return false;
  }
  const family = primaryFamily(style.fontFamily);
  if (family.generic) return true;
  for (const face of document.fonts)
    if (
      primaryFamily(face.family).name === family.name &&
      face.status === "loaded"
    )
      return true;
  // Test the primary family alone so an available fallback cannot conceal its absence.
  const ctx = document.createElement("canvas").getContext("2d")!;
  const sample = "mmmmmmmmmmWWWWiii0123456789";
  return ["monospace", "serif"].every((fallback) => {
    ctx.font = `32px ${fallback}`;
    const base = ctx.measureText(sample).width;
    ctx.font = `32px ${family.css}, ${fallback}`;
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
  const available = await fontAvailable(request.style, request.text);
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
