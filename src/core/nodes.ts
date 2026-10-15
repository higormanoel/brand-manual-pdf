import { z } from 'zod';

export const idSchema = z.string().trim().min(1);
export const colorSchema = z.string().regex(/^#[\da-f]{6}([\da-f]{2})?$/i, 'Use uma cor hexadecimal RGB ou RGBA.');
export const originSchema = z.object({
  kind: z.enum(['provided', 'suggested', 'manual', 'fixture']),
  description: z.string().optional(),
  assetId: idSchema.optional(),
});
export type ContentOrigin = z.infer<typeof originSchema>;

// Approval is explicit; no approver identity is inferred or required.
export const approvalSchema = z.object({
  status: z.enum(['pending', 'approved']),
  at: z.iso.datetime({ offset: true }).optional(),
});
export type Approval = z.infer<typeof approvalSchema>;

export const transformSchema = z.object({
  x: z.number().finite(), y: z.number().finite(),
  width: z.number().finite().positive(), height: z.number().finite().positive(),
  rotation: z.number().finite(), scaleX: z.number().finite(), scaleY: z.number().finite(),
});
export type NodeTransform = z.infer<typeof transformSchema>;

const baseNodeSchema = z.object({
  id: idSchema, name: z.string(), transform: transformSchema,
  opacity: z.number().min(0).max(1), visible: z.boolean(), locked: z.boolean(),
  origin: originSchema, approval: approvalSchema,
  // A generated node can later be distinguished from a manual edit before regeneration.
  generatedFrom: z.object({ sectionId: idSchema, revision: z.number().int().nonnegative() }).optional(),
  manuallyEdited: z.boolean().optional(),
});
export type BaseNode = z.infer<typeof baseNodeSchema>;

export const textStyleSchema = z.object({
  fontFamily: z.string().min(1), fontSize: z.number().positive(),
  fontWeight: z.number().int().min(100).max(900), fontStyle: z.enum(['normal', 'italic']),
  lineHeight: z.number().positive(), letterSpacing: z.number().finite(),
  color: colorSchema, align: z.enum(['left', 'center', 'right', 'justify']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']),
});
export type TextStyle = z.infer<typeof textStyleSchema>;
export const textNodeSchema = baseNodeSchema.extend({ type: z.literal('text'), text: z.string(), style: textStyleSchema });
export type TextNode = z.infer<typeof textNodeSchema>;

export const imageNodeSchema = baseNodeSchema.extend({
  type: z.literal('image'), assetId: idSchema, fit: z.enum(['contain', 'cover', 'fill']),
  alt: z.string().optional(),
  crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) }).optional(),
});
export type ImageNode = z.infer<typeof imageNodeSchema>;

export const shapeStyleSchema = z.object({
  fill: z.union([colorSchema, z.literal('none')]),
  stroke: z.union([colorSchema, z.literal('none')]), strokeWidth: z.number().nonnegative(), cornerRadius: z.number().nonnegative(),
});
export type ShapeStyle = z.infer<typeof shapeStyleSchema>;
export const shapeNodeSchema = baseNodeSchema.extend({
  type: z.literal('shape'), shape: z.enum(['rectangle', 'ellipse', 'line', 'path']),
  style: shapeStyleSchema, path: z.string().optional(),
});
export type ShapeNode = z.infer<typeof shapeNodeSchema>;

// Children are always in the parent node's local coordinate space.
export interface GroupNode extends BaseNode { type: 'group'; children: DocumentNode[] }
export interface Point { x: number; y: number }
export type ProjectionQuad = [Point, Point, Point, Point];
export interface MockupNode extends BaseNode {
  type: 'mockup'; template: 'card' | 'stationery' | 'screen' | 'packaging' | 'poster' | 'custom';
  backgroundAssetId?: string; sceneAssetId?: string; artworkAssetId?: string;
  maskAssetId?: string; overlayAssetId?: string;
  /** Clockwise top-left, top-right, bottom-right, bottom-left, in node-local pixels. */
  quad?: ProjectionQuad; presetId?: string; prompt?: string; status?: 'draft' | 'ready' | 'failed';
  children: DocumentNode[];
}
const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });
export const projectionQuadSchema = z.tuple([pointSchema, pointSchema, pointSchema, pointSchema]);
export type DocumentNode = TextNode | ImageNode | ShapeNode | GroupNode | MockupNode;
export const documentNodeSchema: z.ZodType<DocumentNode> = z.lazy(() => z.discriminatedUnion('type', [
  textNodeSchema, imageNodeSchema, shapeNodeSchema,
  baseNodeSchema.extend({ type: z.literal('group'), children: z.array(documentNodeSchema) }),
  baseNodeSchema.extend({ type: z.literal('mockup'), template: z.enum(['card', 'stationery', 'screen', 'packaging', 'poster', 'custom']),
    backgroundAssetId: idSchema.optional(), sceneAssetId: idSchema.optional(), artworkAssetId: idSchema.optional(),
    maskAssetId: idSchema.optional(), overlayAssetId: idSchema.optional(), quad: projectionQuadSchema.optional(),
    presetId: idSchema.optional(), prompt: z.string().optional(), status: z.enum(['draft', 'ready', 'failed']).optional(),
    children: z.array(documentNodeSchema) }),
]));
