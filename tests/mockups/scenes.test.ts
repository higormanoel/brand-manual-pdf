import { describe, expect, it } from 'vitest';
import type { ProjectionQuad } from '../../src/core/project';
import { documentNodeSchema } from '../../src/core/nodes';
import { BUILTIN_MOCKUP_SCENES, createSceneMockup, createFinalImageMockup, replaceMockupArtwork } from '../../src/mockups/scenes';

const corners: ProjectionQuad = [{ x: 20, y: 10 }, { x: 180, y: 20 }, { x: 170, y: 90 }, { x: 10, y: 80 }];
const options = { presetId: 'card-stack', sceneAssetId: 'scene', artworkAssetId: 'art', sceneWidth: 200, sceneHeight: 100, corners, width: 100, height: 50 };

describe('editable photographic scene applications', () => {
  it.each([
    ['card-stack-photo', 'card-stack', 'card-stack.png', 370.5, 264.5],
    ['laptop-photo', 'laptop', 'laptop.png', 233, 62.5],
    ['poster-photo', 'framed-poster', 'framed-poster.png', 294, 32],
  ])('uses real %s photo corners in node-local pixels', (id, presetId, filename, x, y) => {
    const scene = BUILTIN_MOCKUP_SCENES.find(item => item.id === id)!;
    expect(scene.url).toBe(`/mockups/${filename}`);
    const node = createSceneMockup({ presetId, sceneAssetId: 'photo', artworkAssetId: 'exact-client-art', sceneWidth: scene.width, sceneHeight: scene.height, corners: scene.surfaces[0].corners, width: 836, height: 470.5 });
    expect(node.quad?.[0].x).toBeCloseTo(Number(x));
    expect(node.quad?.[0].y).toBeCloseTo(Number(y));
    expect(node.artworkAssetId).toBe('exact-client-art');
    expect(node.sceneAssetId).toBe('photo');
    expect(node.approval.status).toBe('pending');
    expect(documentNodeSchema.safeParse(node).success).toBe(true);
  });

  it('replaces only artwork and preserves corners, mask, overlay and scene', () => {
    const first = { ...createSceneMockup({ ...options, maskAssetId: 'occlusion', overlayAssetId: 'light' }), approval: { status: 'approved' as const } };
    const before = structuredClone(first);
    const next = replaceMockupArtwork(first, 'new-art');
    expect(next.artworkAssetId).toBe('new-art');
    expect(next.approval.status).toBe('pending');
    expect(next.quad).toEqual([{ x: 10, y: 5 }, { x: 90, y: 10 }, { x: 85, y: 45 }, { x: 5, y: 40 }]);
    expect(next.maskAssetId).toBe('occlusion');
    expect(next.overlayAssetId).toBe('light');
    expect(next.sceneAssetId).toBe('scene');
    expect(first).toEqual(before);
  });

  it('rejects invalid or crossed imported corners before an unusable node is inserted', () => {
    expect(() => createSceneMockup({ ...options, sceneWidth: 0 })).toThrow();
    expect(() => createSceneMockup({ ...options, corners: [corners[0], corners[2], corners[1], corners[3]] })).toThrow();
    expect(() => createSceneMockup({ ...options, corners: [{ x: -1, y: 0 }, ...corners.slice(1)] as ProjectionQuad })).toThrow();
    expect(() => createSceneMockup({ ...options, artworkAssetId: ' ' })).toThrow();
  });

  it('does not offer planar cloth or embroidery as an exact application', () => {
    expect(() => createSceneMockup({ ...options, presetId: 'embroidered-cap' })).toThrow(/imagem final/i);
    expect(() => createSceneMockup({ ...options, presetId: 'tshirt-jacket' })).toThrow(/imagem final/i);
  });

  it('stores a replaceable finished image without fabric projection claims', () => {
    const node = createFinalImageMockup({ presetId: 'embroidered-cap', assetId: 'reviewed-result', width: 800, height: 450, prompt: 'Exact supplied logo' });
    expect(node.artworkAssetId).toBeUndefined();
    expect(node.quad).toBeUndefined();
    expect(node.children[0]).toMatchObject({ type: 'image', assetId: 'reviewed-result', fit: 'contain' });
    expect(node.approval.status).toBe('pending');
    expect(documentNodeSchema.safeParse(node).success).toBe(true);
  });
});
