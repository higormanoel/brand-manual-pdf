import { describe, expect, it } from 'vitest';
import { MOCKUP_PRESETS } from '../../src/mockups/presets';
import { resolveMockupPrompt } from '../../src/mockups/prompts';

const assets = {
  sceneAsset: { assetId: 'scene', name: 'Base original.png' },
  artworkAsset: { assetId: 'artwork', name: 'Arte aprovada.svg' },
  logoAsset: { assetId: 'logo', name: 'Logo fornecido.svg' },
};

describe('mockup prompt preparation', () => {
  it('resolves all twelve approved scenes with selected identity files and no unresolved tokens', () => {
    expect(MOCKUP_PRESETS).toHaveLength(12);
    for (const preset of MOCKUP_PRESETS) {
      const result = resolveMockupPrompt(preset.id, { ...assets, brandName: 'Marca fornecida', aspectRatio: '4:3' });
      expect(result.status).toBe('ready');
      expect(result.prompt).toContain(preset.scene);
      expect(result.prompt).toContain('4:3');
      expect(result.prompt).toContain('Arte aprovada.svg');
      expect(result.prompt).not.toMatch(/\{\{|\}\}|undefined/);
      expect(result.usedAssetIds).toContain('scene');
      expect(result.usedAssetIds).toContain('artwork');
    }
  });

  it('returns actionable upload requirements without preparing an incomplete application', () => {
    const result = resolveMockupPrompt('card-stack', {});
    expect(result.status).toBe('missing-inputs');
    expect(result.prompt).toBeUndefined();
    expect(result.missingInputs.map(item => item.id)).toEqual(['sceneAsset', 'identityAsset']);
    expect(result.usedAssetIds).toEqual([]);
  });

  it('requires both letterhead and logo for the open binder', () => {
    const result = resolveMockupPrompt('open-binder', { sceneAsset: assets.sceneAsset, artworkAsset: assets.artworkAsset });
    expect(result.missingInputs.map(item => item.id)).toEqual(['logoAsset']);
  });

  it('allows the explicitly supplied logo as a card identity without inventing copy', () => {
    const result = resolveMockupPrompt('card-stack', { sceneAsset: assets.sceneAsset, logoAsset: assets.logoAsset });
    expect(result.status).toBe('ready');
    expect(result.usedAssetIds).toEqual(['scene', 'logo']);
    expect(result.prompt).toContain('Logo fornecido.svg');
    expect(result.prompt).toContain('Do not invent');
  });

  it('prepares every blank scene without identity uploads and ignores unselected portrait identity', () => {
    for (const preset of MOCKUP_PRESETS) {
      const result = resolveMockupPrompt(preset.id, { mode: 'scene', material: 'Supplied matte paper', aspectRatio: '16:9' });
      expect(result.status).toBe('ready');
      expect(result.prompt).toContain('No branding, no invented lettering');
      expect(result.prompt).toContain('Supplied matte paper');
      expect(result.usedAssetIds).toEqual([]);
    }
  });

  it('does not silently send placeholder text or blank asset references to a generator', () => {
    const result = resolveMockupPrompt('laptop', { ...assets, material: '{{material}}', artworkAsset: { assetId: '', name: 'Arte' } });
    expect(result.status).toBe('missing-inputs');
    expect(result.prompt).toBeUndefined();
    expect(result.missingInputs.map(item => item.id)).toContain('material');
    expect(result.missingInputs.map(item => item.id)).toContain('artworkAsset');
  });

  it('uses a generic synthetic adult unless an explicitly authorized portrait is selected', () => {
    const generic = resolveMockupPrompt('portrait-badge', assets);
    expect(generic.prompt).toContain('generic synthetic adult');
    const portrait = resolveMockupPrompt('portrait-badge', { ...assets, portraitAsset: { assetId: 'portrait', name: 'Retrato autorizado.png' } });
    expect(portrait.usedAssetIds).toContain('portrait');
    expect(portrait.prompt).toContain('Retrato autorizado.png');
    expect(portrait.prompt).not.toContain('generic synthetic adult');
  });

  it('keeps supplied scene instructions separate from blank-scene generation', () => {
    const result = resolveMockupPrompt('laptop', assets);
    expect(result.prompt).toContain('Keep the remaining scene consistent');
    expect(result.prompt).not.toContain('Produce a new scene');
    expect(result.prompt).not.toContain('No branding, no invented lettering');
  });

  it('rejects unknown preset ids instead of silently preparing another scene', () => {
    expect(() => resolveMockupPrompt('unknown', assets)).toThrow(/Preset/);
  });
});
