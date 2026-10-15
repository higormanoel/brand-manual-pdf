import { z } from 'zod';
import { assetRecordSchema } from './assets';
import { approvalSchema, colorSchema, documentNodeSchema, idSchema, originSchema } from './nodes';

export const SCHEMA_VERSION = 1 as const;
export const PAGE_WIDTH = 1920;
export const PAGE_HEIGHT = 1080;
export const SECTION_DEFINITIONS = [
  { kind: 'introduction', title: 'Apresentação', optional: false },
  { kind: 'brand-strategy', title: 'Posicionamento', optional: false },
  { kind: 'archetypes', title: 'Arquétipos', optional: true },
  { kind: 'pillars', title: 'Pilares da marca', optional: true },
  { kind: 'voice', title: 'Voz e linguagem', optional: false },
  { kind: 'logo', title: 'Marca e assinaturas', optional: false },
  { kind: 'clear-space', title: 'Área de proteção e redução', optional: false },
  { kind: 'incorrect-usage', title: 'Usos incorretos', optional: false },
  { kind: 'photography', title: 'Direção de imagens', optional: false },
  { kind: 'colors', title: 'Paleta de cores', optional: false },
  { kind: 'typography', title: 'Tipografia', optional: false },
  { kind: 'graphic-elements', title: 'Elementos gráficos', optional: false },
  { kind: 'applications', title: 'Mídias e aplicações', optional: false },
  { kind: 'identity-complete', title: 'Identidade completa', optional: false },
  { kind: 'credits', title: 'Créditos', optional: false },
] as const;
export type SectionKind = typeof SECTION_DEFINITIONS[number]['kind'];
export const sectionKindSchema = z.enum(SECTION_DEFINITIONS.map(section => section.kind));
export const sectionContentSchema = z.object({
  heading: z.string().optional(), summary: z.string().optional(),
  paragraphs: z.array(z.string()).default([]), rules: z.array(z.string()).default([]),
  assetIds: z.array(idSchema).default([]), colorIds: z.array(idSchema).default([]), typographyIds: z.array(idSchema).default([]),
});
export type SectionContent = z.infer<typeof sectionContentSchema>;
export const sectionRecordSchema = z.object({
  id: idSchema, kind: sectionKindSchema, title: z.string().min(1), enabled: z.boolean(),
  status: z.enum(['not-started', 'provided', 'suggested', 'skipped', 'approved']),
  content: sectionContentSchema.optional(), origin: originSchema, approval: approvalSchema,
});
export type SectionRecord = z.infer<typeof sectionRecordSchema>;
export type SectionStatus = SectionRecord['status'];

export const briefSchema = z.object({
  purpose: z.string().optional(), audience: z.string().optional(), positioning: z.string().optional(),
  personality: z.array(z.string()).default([]), deliverables: z.array(z.string()).default([]), notes: z.string().optional(),
});
export type ProjectBrief = z.infer<typeof briefSchema>;
export const brandColorSchema = z.object({
  id: idSchema, name: z.string().min(1), hex: colorSchema,
  role: z.enum(['primary', 'secondary', 'accent', 'neutral']), usage: z.string().optional(), origin: originSchema, approval: approvalSchema,
});
export type BrandColor = z.infer<typeof brandColorSchema>;
export const brandTypographySchema = z.object({
  id: idSchema, family: z.string().min(1), role: z.enum(['display', 'heading', 'body', 'caption']),
  weights: z.array(z.number().int().min(100).max(900)), fallback: z.string(),
  assetId: idSchema.optional(), license: z.string().optional(), origin: originSchema, approval: approvalSchema,
});
export type BrandTypography = z.infer<typeof brandTypographySchema>;
export const logoVariantSchema = z.object({
  id: idSchema, name: z.string().min(1), assetId: idSchema,
  variant: z.enum(['primary', 'secondary', 'symbol', 'monochrome', 'reversed']),
  background: z.enum(['light', 'dark', 'any']),
  clearSpace: z.number().nonnegative().optional(), minWidth: z.number().positive().optional(),
  origin: originSchema, approval: approvalSchema,
});
export type LogoVariant = z.infer<typeof logoVariantSchema>;
export const brandDataSchema = z.object({
  name: z.string().trim().min(1), tagline: z.string().optional(), description: z.string().optional(),
  fictitious: z.boolean().default(false), values: z.array(z.string()).default([]),
  colors: z.array(brandColorSchema).default([]), typography: z.array(brandTypographySchema).default([]), logos: z.array(logoVariantSchema).default([]),
  definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  narratives: z.array(z.object({ title: z.string(), text: z.string() })).default([]),
  mantras: z.array(z.string()).default([]),
  dictionary: z.array(z.object({ term: z.string(), meaning: z.string(), usage: z.string().optional() })).default([]),
  voice: z.object({ traits: z.array(z.string()), do: z.array(z.string()), avoid: z.array(z.string()), sample: z.string().optional(),
    modes: z.array(z.object({ id: idSchema, name: z.string(), description: z.string().optional(), do: z.array(z.string()), dont: z.array(z.string()),
      examples: z.array(z.object({ wrong: z.string(), right: z.string(), explanation: z.string().optional() })).optional(),
    })).default([]),
  }).optional(),
});
export type BrandData = z.infer<typeof brandDataSchema>;
export const pageSchema = z.object({
  id: idSchema, sectionId: idSchema, title: z.string(),
  width: z.number().positive().default(PAGE_WIDTH), height: z.number().positive().default(PAGE_HEIGHT),
  background: colorSchema, nodes: z.array(documentNodeSchema),
});
export type Page = z.infer<typeof pageSchema>;
export const editorialConfigSchema = z.object({
  displayFontFamily: z.string().min(1).default('Inter'),
  bodyFontFamily: z.string().min(1).default('Inter'),
  captionFontFamily: z.string().min(1).default('Inter'),
});
export type EditorialConfig = z.infer<typeof editorialConfigSchema>;
export const projectCreditsSchema = z.object({
  studio: z.string().optional(), author: z.string().optional(), handle: z.string().optional(), website: z.string().optional(),
  contributors: z.array(z.object({ name: z.string(), role: z.string().optional() })).optional(),
  license: z.string().optional(), notes: z.string().optional(),
});
export type ProjectCredits = z.infer<typeof projectCreditsSchema>;
export const projectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION), id: idSchema, title: z.string().trim().min(1),
  revision: z.number().int().nonnegative(),
  brief: briefSchema, brand: brandDataSchema,
  editorial: editorialConfigSchema.prefault({}), credits: projectCreditsSchema.default({}),
  assets: z.array(assetRecordSchema), sections: z.array(sectionRecordSchema), pages: z.array(pageSchema),
});
export type BrandProject = z.infer<typeof projectSchema>;
export interface Diagnostic {
  code: 'invalid-value' | 'unsupported-version' | 'missing-asset' | 'missing-section' | 'missing-color' | 'missing-typography' | 'duplicate-id' | 'text-overflow' | 'outside-page' | 'font-substitution' | 'invalid-projection';
  severity: 'error' | 'warning'; path: string; message: string;
}
