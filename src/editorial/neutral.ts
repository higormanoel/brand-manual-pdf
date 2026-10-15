import type { EditorialConfig, SectionKind, TextStyle } from '../core/project';

export const NEUTRAL = {
  width: 1920, height: 1080, margin: 91,
  dark: '#040606', light: '#FFFFFF', ink: '#0F0F0F', muted: '#38393B',
  bodyX: 760, bodyWidth: 1069, bodyTop: 260, bodyBottom: 930,
} as const;
export type EditorialRole = 'display' | 'quote' | 'heading' | 'body' | 'caption';
export function editorialStyle(config: EditorialConfig, role: EditorialRole, dark = false): TextStyle {
  const family = role === 'display' || role === 'quote' || role === 'heading' ? config.displayFontFamily : role === 'caption' ? config.captionFontFamily : config.bodyFontFamily;
  return {
    fontFamily: family === 'Inter' ? family : `${family}, Inter, sans-serif`,
    fontSize: { display: 72, quote: 56, heading: 36, body: 21, caption: 13 }[role],
    fontWeight: role === 'display' || role === 'heading' ? 700 : 400,
    fontStyle: 'normal', lineHeight: role === 'body' ? 1.5 : 1.2,
    letterSpacing: 0, color: dark ? NEUTRAL.light : NEUTRAL.ink,
    align: 'left', verticalAlign: 'top',
  };
}
export const CHAPTERS: readonly { title: string; kinds: readonly SectionKind[] }[] = [
  { title: 'Posicionamento', kinds: ['brand-strategy', 'voice'] },
  { title: 'Logotipo', kinds: ['logo', 'clear-space', 'incorrect-usage'] },
  { title: 'Estilo fotográfico', kinds: ['photography'] },
  { title: 'Cores', kinds: ['colors'] },
  { title: 'Tipografia', kinds: ['typography'] },
  { title: 'Elementos gráficos', kinds: ['graphic-elements'] },
  { title: 'Mídias e aplicações', kinds: ['applications'] },
  { title: 'Identidade completa', kinds: ['identity-complete'] },
];
