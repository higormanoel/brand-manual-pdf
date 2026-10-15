import sceneManifest from './scenes-data.json';
import type { MockupNode, ProjectionQuad } from '../core/project';
import { projectToQuad } from './projection';
import { getMockupPreset } from './presets';

export interface BuiltinMockupScene {
  id: string;
  name: string;
  url: string;
  kind: 'generated-photographic-scene';
  width: number;
  height: number;
  surfaces: { id: string; name: string; corners: ProjectionQuad }[];
}
/** Actual project-generated PNG photographs; coordinates are image pixels, never percentages. */
export const BUILTIN_MOCKUP_SCENES: readonly BuiltinMockupScene[] = sceneManifest.map(scene => ({
  id: scene.id, name: scene.name, url: `/mockups/${scene.file}`, kind: 'generated-photographic-scene',
  width: scene.width, height: scene.height,
  surfaces: scene.surfaces.map(surface => ({ ...surface, corners: surface.corners.map(point => ({ ...point })) as ProjectionQuad })),
}));

export interface CreateSceneMockupOptions {
  presetId: string;
  sceneAssetId: string;
  /** Complete application artwork already composed for this surface, not an isolated logo to stretch. */
  artworkAssetId: string;
  sceneWidth: number;
  sceneHeight: number;
  corners: ProjectionQuad;
  width?: number;
  height?: number;
  maskAssetId?: string;
  overlayAssetId?: string;
  prompt?: string;
}

function requireId(value: string): string {
  if (!value.trim()) throw new Error('Selecione um asset válido.');
  return value;
}
function requireSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('A cena e o nó precisam de dimensões positivas.');
}
const base = (name: string, width: number, height: number) => ({
  id: crypto.randomUUID(), name,
  transform: { x: 0, y: 0, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
  opacity: 1, visible: true, locked: false,
  origin: { kind: 'manual' as const }, approval: { status: 'pending' as const },
});

/** Immutable node factory. The caller persists scene/art assets and explicitly approves insertion. */
export function createSceneMockup(options: CreateSceneMockupOptions): MockupNode {
  const preset = getMockupPreset(options.presetId);
  if (preset.application !== 'planar') throw new Error('Esta cena usa uma imagem final revisada, sem aplicação planar de tecido ou bordado.');
  const width = options.width ?? 960;
  const height = options.height ?? width * options.sceneHeight / options.sceneWidth;
  [width, height, options.sceneWidth, options.sceneHeight].forEach(requireSize);
  if (options.corners.length !== 4 || options.corners.some(point =>
    !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x > options.sceneWidth || point.y > options.sceneHeight))
    throw new Error('Marque quatro cantos dentro da imagem da cena.');
  const quad = options.corners.map(point => ({ x: point.x / options.sceneWidth * width, y: point.y / options.sceneHeight * height })) as ProjectionQuad;
  projectToQuad(quad);
  return {
    ...base(preset.name, width, height), type: 'mockup', template: preset.template,
    presetId: preset.id, status: 'ready', sceneAssetId: requireId(options.sceneAssetId),
    artworkAssetId: requireId(options.artworkAssetId), quad,
    ...(options.maskAssetId ? { maskAssetId: requireId(options.maskAssetId) } : {}),
    ...(options.overlayAssetId ? { overlayAssetId: requireId(options.overlayAssetId) } : {}),
    ...(options.prompt ? { prompt: options.prompt } : {}), children: [],
  };
}

export function replaceMockupArtwork(node: MockupNode, artworkAssetId: string): MockupNode {
  if (!node.quad || !node.sceneAssetId) throw new Error('Escolha uma aplicação planar para substituir a arte.');
  return { ...node, artworkAssetId: requireId(artworkAssetId), approval: { status: 'pending' }, manuallyEdited: true };
}

export function createFinalImageMockup(options: { presetId: string; assetId: string; width: number; height: number; prompt?: string }): MockupNode {
  const preset = getMockupPreset(options.presetId);
  [options.width, options.height].forEach(requireSize);
  return {
    ...base(`${preset.name} — imagem final`, options.width, options.height),
    type: 'mockup', template: 'custom', presetId: preset.id, status: 'ready', prompt: options.prompt,
    children: [{
      ...base('Imagem final substituível', options.width, options.height),
      type: 'image', assetId: requireId(options.assetId), fit: 'contain', alt: preset.name,
      origin: { kind: 'provided', assetId: options.assetId },
    }],
  };
}
