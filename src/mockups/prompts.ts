import { getMockupPreset, type MockupPreset } from './presets';

export interface PromptAsset { assetId: string; name: string }
export interface MockupPromptInputs {
  mode?: 'scene' | 'application';
  brandName?: string;
  sceneAsset?: PromptAsset;
  logoAsset?: PromptAsset;
  artworkAsset?: PromptAsset;
  portraitAsset?: PromptAsset;
  palette?: string[];
  material?: string;
  aspectRatio?: string;
  sceneVariant?: string;
}
export interface MissingMockupInput { id: string; label: string; kind: 'upload' | 'text' }
export interface ResolvedPrompt {
  presetId: string;
  presetVersion: number;
  mode: 'scene' | 'application';
  status: 'ready' | 'missing-inputs';
  prompt?: string;
  usedAssetIds: string[];
  missingInputs: MissingMockupInput[];
}
const hasToken = (value: string) => /\{\{|\}\}/.test(value);
const validAsset = (asset: PromptAsset | undefined) => Boolean(asset?.assetId.trim() && asset.name.trim() && !hasToken(asset.name));

/** No project writes and no generation: a ready prompt is text, never a generated image. */
export function resolveMockupPrompt(presetId: string, inputs: MockupPromptInputs = {}): ResolvedPrompt {
  const preset = getMockupPreset(presetId);
  const mode = inputs.mode ?? 'application';
  const missingInputs: MissingMockupInput[] = [];
  const requireUpload = (id: string, label: string) => missingInputs.push({ id, label, kind: 'upload' });
  if (mode === 'application') {
    if (!validAsset(inputs.sceneAsset)) requireUpload('sceneAsset', 'Envie ou selecione a cena base.');
    if (preset.identity === 'artwork-or-logo' && !validAsset(inputs.artworkAsset) && !validAsset(inputs.logoAsset))
      requireUpload('identityAsset', 'Envie uma arte ou um logo aprovado.');
    if (['artwork', 'artwork-and-logo'].includes(preset.identity) && !validAsset(inputs.artworkAsset))
      requireUpload('artworkAsset', 'Envie a arte aprovada para esta superfície.');
    if (['logo', 'artwork-and-logo'].includes(preset.identity) && !validAsset(inputs.logoAsset))
      requireUpload('logoAsset', 'Envie o logo aprovado.');
    for (const key of ['artworkAsset', 'logoAsset', 'portraitAsset'] as const) {
      if (inputs[key] && !validAsset(inputs[key]) && !missingInputs.some(item => item.id === key)) requireUpload(key, 'Selecione um arquivo válido, com nome e identificador.');
    }
  }
  for (const key of ['brandName', 'material', 'aspectRatio', 'sceneVariant'] as const) {
    if (inputs[key] !== undefined && (!inputs[key]!.trim() || hasToken(inputs[key]!)))
      missingInputs.push({ id: key, label: `Preencha ${key} sem tokens de placeholder ou remova o campo opcional.`, kind: 'text' });
  }
  if (inputs.palette?.some(value => !value.trim() || hasToken(value)))
    missingInputs.push({ id: 'palette', label: 'Informe as cores fornecidas ou remova a paleta opcional.', kind: 'text' });
  const result: ResolvedPrompt = { presetId, presetVersion: preset.version, mode, status: missingInputs.length ? 'missing-inputs' : 'ready', usedAssetIds: [], missingInputs };
  if (missingInputs.length) return result;
  const direction = sceneDirection(preset, inputs, mode === 'scene');
  if (mode === 'scene') return { ...result, prompt: direction };

  const selected = [inputs.sceneAsset, inputs.artworkAsset, inputs.logoAsset,
    ...(preset.id === 'portrait-badge' ? [inputs.portraitAsset] : []),
  ].filter((asset): asset is PromptAsset => Boolean(asset));
  const prompt = [
    `Scene direction (preserve the supplied scene):\n${direction}`,
    `Use the supplied scene image as the composition reference and the supplied artwork as the exact identity to apply to ${preset.surface}. Preserve the artwork's proportions, layout, spelling and colors. Integrate it with the surface perspective, material, lighting and shadows. Do not invent another logo or rewrite the design. Keep the remaining scene consistent. Return one finished presentation image.`,
    `Selected files: ${selected.map(asset => JSON.stringify(asset.name)).join(', ')}. Use only these explicitly selected files.`,
    inputs.brandName ? `Brand name supplied by the designer: ${JSON.stringify(inputs.brandName.trim())}. Do not add lettering that is absent from the supplied artwork.` : '',
    inputs.palette?.length ? `Colors supplied by the designer: ${inputs.palette.join(', ')}. Preserve the supplied artwork colors.` : '',
    'Do not invent names, job titles, claims, testimonials, statistics, certifications or institutional text. Do not reproduce an existing photograph or a specific person from a reference document.',
    preset.id === 'portrait-badge' && !inputs.portraitAsset ? 'Use a generic synthetic adult; do not portray a real individual.' : '',
    preset.application === 'finished-image' ? 'Preserve fabric folds, material texture and realistic embroidery/print. This is one finished image and requires designer review; it is not a parametric cloth or embroidery application.' : '',
  ].filter(Boolean).join('\n\n');
  return { ...result, prompt, usedAssetIds: [...new Set(selected.map(asset => asset.assetId))] };
}

function sceneDirection(preset: MockupPreset, inputs: MockupPromptInputs, blankScene: boolean): string {
  return [
    blankScene ? 'Create an original premium brand presentation photograph for a visual identity system.' : 'Use the supplied scene; the following details describe its intended art direction.',
    `Scene: ${preset.scene}.`, `Composition: ${preset.composition}.`,
    `Material: ${(inputs.material ?? preset.material).trim()}.`, `Camera: ${preset.camera}.`,
    'Lighting: controlled low-key studio photography, deep charcoal surroundings, soft directional key light, readable material detail, restrained contrast, natural shadows and a cinematic editorial finish.',
    'Palette in the scene: neutral black, charcoal and restrained warm neutrals.',
    `Required output aspect ratio: ${(inputs.aspectRatio ?? '16:9').trim()}.`,
    inputs.sceneVariant ? `Designer-supplied scene variation: ${inputs.sceneVariant.trim()}.` : '',
    blankScene ? 'Leave the designated application surface clean and unobstructed.' : '',
    blankScene ? 'No branding, no invented lettering, no watermark, no additional logos.' : '',
    blankScene ? "Produce a new scene; do not reproduce a specific person's identity or an existing photograph." : '',
  ].filter(Boolean).join('\n');
}
