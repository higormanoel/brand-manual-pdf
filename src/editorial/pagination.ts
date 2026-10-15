import type { TextStyle } from '../core/nodes';
import type { TextMeasureRequest, TextMeasureResult } from '../render/textMeasurement';
export type MeasureText = (request: TextMeasureRequest) => Promise<TextMeasureResult>;
export interface TextFragment { text: string; measurement: TextMeasureResult }
export interface PaginationOptions {
  style: TextStyle; width: number; height: number; measureText: MeasureText;
  continuationHeight?: number;
}

/** Split only at grapheme boundaries, asking the browser whether each candidate
 * fits. String lengths select a search boundary; they never estimate layout.
 * Whitespace belongs to a fragment and is never trimmed or normalized.
 */
export async function paginateText(text: string, options: PaginationOptions): Promise<TextFragment[]> {
  if (!(options.width > 0) || !(options.height > 0) || (options.continuationHeight !== undefined && !(options.continuationHeight > 0)))
    throw new RangeError('A caixa de paginação exige dimensões positivas.');
  if (!text) return [];
  const boundaries = [0];
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const segment of segmenter.segment(text)) boundaries.push(segment.index + segment.segment.length);
  const fragments: TextFragment[] = [];
  let start = 0;
  while (start < boundaries.length - 1) {
    const height = fragments.length ? options.continuationHeight ?? options.height : options.height;
    const measure = (end: number) => options.measureText({ text: text.slice(boundaries[start], boundaries[end]), style: options.style, width: options.width, height });
    const fits = (m: TextMeasureResult) => !m.overflow && Math.ceil(Math.max(m.height, m.scrollHeight)) <= height && m.scrollWidth <= options.width + .5;
    let end = boundaries.length - 1;
    let measurement = await measure(end);
    if (!fits(measurement)) {
      let low = start, high = end;
      while (low + 1 < high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = await measure(middle);
        if (fits(candidate)) low = middle;
        else high = middle;
      }
      if (low === start) throw new RangeError('O primeiro grafema não cabe na caixa editorial com a fonte medida.');
      end = low;
      // Prefer a word boundary in the last quarter of a measured page. Long
      // unbroken strings still progress at a complete grapheme boundary.
      const floor = start + Math.floor((end - start) * .75);
      for (let index = end; index > floor; index--) {
        if (/\s$/u.test(text.slice(boundaries[index - 1], boundaries[index]))) { end = index; break; }
      }
      measurement = await measure(end);
      if (!fits(measurement)) throw new Error('A medição de texto mudou durante a paginação.');
    }
    fragments.push({ text: text.slice(boundaries[start], boundaries[end]), measurement });
    start = end;
  }
  return fragments;
}
