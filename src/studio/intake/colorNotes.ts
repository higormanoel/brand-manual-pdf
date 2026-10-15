type ColorLabel = { id: string; name: string; hex: string };
export type ColorNotes = Record<string, { rgb: string; cmyk: string }>;
export const COLOR_NOTE_PREFIX = "Coordenadas fornecidas · ";
/** Human-readable section paragraphs, never a conversion or export color profile. */
export function encodeColorNotes(
  paragraphs: string[],
  colors: ColorLabel[],
  notes: ColorNotes,
): string[] {
  return [
    ...paragraphs.filter((text) => !text.startsWith(COLOR_NOTE_PREFIX)),
    ...colors.flatMap((color) => {
      const note = notes[color.id];
      return note && (note.rgb.trim() || note.cmyk.trim())
        ? [
            `${COLOR_NOTE_PREFIX}${color.name} (${color.hex}) | RGB fornecido: ${note.rgb} | CMYK fornecido: ${note.cmyk}`,
          ]
        : [];
    }),
  ];
}
export function decodeColorNotes(
  paragraphs: string[],
  colors: ColorLabel[],
): ColorNotes {
  const notes: ColorNotes = {};
  for (const color of colors) {
    const prefix = `${COLOR_NOTE_PREFIX}${color.name} (${color.hex}) | RGB fornecido: `;
    const paragraph = paragraphs.find((text) => text.startsWith(prefix));
    if (!paragraph) continue;
    const split = paragraph.slice(prefix.length).indexOf(" | CMYK fornecido: ");
    if (split < 0) continue;
    const remainder = paragraph.slice(prefix.length);
    notes[color.id] = {
      rgb: remainder.slice(0, split),
      cmyk: remainder.slice(split + " | CMYK fornecido: ".length),
    };
  }
  return notes;
}
