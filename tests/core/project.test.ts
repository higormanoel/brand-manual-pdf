import { describe, expect, it } from 'vitest';
import { createProject, parseProject, ProjectValidationError, type BrandProject } from '../../src/core/project';
import type { DocumentNode } from '../../src/core/nodes';

function diagnostics(input: unknown) {
  try { parseProject(input); } catch (error) {
    if (error instanceof ProjectValidationError) return error.diagnostics;
    throw error;
  }
  throw new Error('Expected validation to fail');
}

// Break caught: a minimal brief should not require logos, colors, pages or answers.
describe('project document contract', () => {
  it('creates a valid project from its name alone', () => {
    const project = createProject('  Aurora  ');
    expect(project.title).toBe('Aurora');
    expect(project.schemaVersion).toBe(1);
    expect(project.revision).toBe(0);
    expect(project.pages).toEqual([]);
    expect(project.assets).toEqual([]);
    expect(project.brand.name).toBe('Aurora');
    expect(project.sections.length).toBeGreaterThan(5);
    expect(parseProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });

  it('defaults a title-only input without requiring content', () => {
    const project = parseProject({ title: 'Lume' });
    expect(project.title).toBe('Lume');
    expect(project.brand.name).toBe('Lume');
    expect(project.sections.every(section => section.status === 'not-started')).toBe(true);
  });

  it('keeps stable IDs when saved and reopened, with unique new project IDs', () => {
    const project = createProject('Aurora');
    expect(parseProject(project).id).toBe(project.id);
    expect(parseProject(project).sections.map(section => section.id)).toEqual(project.sections.map(section => section.id));
    expect(createProject('Aurora').id).not.toBe(project.id);
  });

  it('accepts skipped sections without content', () => {
    const project = createProject('Aurora');
    project.sections[0].status = 'skipped';
    delete project.sections[0].content;
    expect(parseProject(project).sections[0].status).toBe('skipped');
  });

  it('preserves answers and approval when disabling a section', () => {
    const project = createProject('Aurora');
    const section = project.sections[0];
    section.enabled = false;
    section.status = 'approved';
    section.approval = { status: 'approved', at: '2026-10-15T12:00:00Z' };
    section.content = { heading: 'Essência', paragraphs: ['Cuidado em cada começo.'], rules: [], assetIds: [], colorIds: [], typographyIds: [] };
    const parsed = parseProject(project).sections[0];
    expect(parsed.enabled).toBe(false);
    expect(parsed.content?.paragraphs).toEqual(['Cuidado em cada começo.']);
    expect(parsed.approval).toEqual({ status: 'approved', at: '2026-10-15T12:00:00Z' });
  });

  it('reports a negative revision with a precise path', () => {
    expect(diagnostics({ ...createProject('Aurora'), revision: -1 })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-value', path: 'revision', severity: 'error' }),
    ]));
  });

  it('reports unsupported future versions before interpreting their contents', () => {
    expect(diagnostics({ schemaVersion: 2 })).toEqual([
      expect.objectContaining({ code: 'unsupported-version', path: 'schemaVersion', message: expect.stringContaining('2') }),
    ]);
  });

  it.each(['', '   '])('rejects an empty project title (%j)', title => {
    expect(diagnostics({ title })).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'title', code: 'invalid-value' }),
    ]));
  });

  it('rejects unsafe relative asset paths', () => {
    const project = createProject('Aurora');
    project.assets = [{ id: 'logo', mimeType: 'image/svg+xml', name: 'Logo', path: '../private.svg', hash: 'a'.repeat(64), origin: { kind: 'provided' } }];
    expect(diagnostics(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'assets.0.path', code: 'invalid-value' }),
    ]));
  });
});

const image: DocumentNode = {
  id: 'logo-node', type: 'image', name: 'Marca',
  transform: { x: 32, y: 64, width: 240, height: 120, rotation: 0, scaleX: 1, scaleY: 1 },
  opacity: 1, visible: true, locked: false, origin: { kind: 'manual' }, approval: { status: 'pending' },
  assetId: 'missing-logo', fit: 'contain',
};
function pageProject(): BrandProject {
  const project = createProject('Aurora');
  project.pages = [{ id: 'cover', sectionId: project.sections[0].id, title: 'Capa', width: 1920, height: 1080, background: '#141E25', nodes: [] }];
  return project;
}

describe('editable nodes and references', () => {
  it('reports a missing asset inside local-coordinate groups', () => {
    const project = pageProject();
    project.pages[0].nodes = [{ ...image, id: 'group', type: 'group', children: [image] }];
    expect(diagnostics(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-asset', path: 'pages.0.nodes.0.children.0.assetId', message: expect.stringContaining('missing-logo') }),
    ]));
  });

  it('retains editable node values and child coordinates on round trip', () => {
    const project = pageProject();
    project.assets = [{ id: 'missing-logo', mimeType: 'image/svg+xml', name: 'Logo', path: 'assets/logo.svg', hash: 'a'.repeat(64), origin: { kind: 'provided' } }];
    project.pages[0].nodes = [{ ...image, id: 'group', type: 'group', children: [image] }];
    const parsed = parseProject(project);
    const group = parsed.pages[0].nodes[0];
    expect(group.type).toBe('group');
    if (group.type !== 'group') throw new Error('Expected group');
    expect(group.children[0].transform.x).toBe(32);
    expect(group.children[0].transform.y).toBe(64);
    expect(group.transform.width).toBe(240);
    expect(group.children[0].origin.kind).toBe('manual');
  });

  it('rejects duplicate node IDs across a document', () => {
    const project = pageProject();
    const node: DocumentNode = { ...image, type: 'shape', shape: 'rectangle', style: { fill: '#FFFFFF', stroke: '#000000', strokeWidth: 0, cornerRadius: 0 } };
    project.pages[0].nodes = [node, node];
    expect(diagnostics(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'duplicate-id', path: 'pages.0.nodes.1.id' }),
    ]));
  });

  it('rejects malformed transforms instead of letting NaN reach the editor', () => {
    const project = pageProject();
    project.pages[0].nodes = [{ ...image, transform: { ...image.transform, width: Number.NaN } }];
    expect(diagnostics(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'pages.0.nodes.0.transform.width', code: 'invalid-value' }),
    ]));
  });
});

// Break caught: demo material must be independently usable, truthful and portable.
describe('Aurora original demonstration fixture', () => {
  it('loads an explicitly fictional complete brand ready for page generation', async () => {
    const { existsSync } = await import('node:fs');
    const { readFile } = await import('node:fs/promises');
    const fixturePath = new URL('../../fixtures/aurora/project.json', import.meta.url);
    expect(existsSync(fixturePath)).toBe(true);
    const project = parseProject(JSON.parse(await readFile(fixturePath, 'utf8')));
    expect(project.brand.fictitious).toBe(true);
    expect(project.brand.name).toBe('Aurora');
    expect(project.brand.colors).toHaveLength(5);
    expect(project.brand.logos.length).toBeGreaterThanOrEqual(3);
    expect(project.brief.audience).toContain('cafés');
    expect(project.sections.every(section => section.status === 'approved' && section.content?.paragraphs.length)).toBe(true);
    expect(project.pages).toEqual([]);
  });

  it('ships original artwork and licensed font assets whose stored hashes match their bytes', async () => {
    const { existsSync } = await import('node:fs');
    const { readFile } = await import('node:fs/promises');
    const { createHash } = await import('node:crypto');
    const fixturePath = new URL('../../fixtures/aurora/project.json', import.meta.url);
    expect(existsSync(fixturePath)).toBe(true);
    const project = parseProject(JSON.parse(await readFile(fixturePath, 'utf8')));
    for (const asset of project.assets) {
      const bytes = await readFile(new URL(`../../fixtures/aurora/${asset.path}`, import.meta.url));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.hash);
      expect(asset.origin.kind).toBe('fixture');
      if (asset.mimeType === 'font/ttf') {
        expect(asset.license).toContain('SIL Open Font License 1.1');
        expect(project.brand.typography.some(face => face.assetId === asset.id)).toBe(true);
      } else if (asset.mimeType === 'text/plain') {
        expect(asset.license).toContain('SIL Open Font License 1.1');
        expect(bytes.toString('utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1');
      } else {
        expect(asset.mimeType).toBe('image/svg+xml');
        expect(asset.license).toContain('CC0');
      }
    }
  });
});

describe('editorial and application extension contracts', () => {
  it('defaults editorial fonts independently of brand typography and keeps explicit credits', () => {
    const project = createProject('Aurora');
    expect(project.editorial.displayFontFamily).toBe('Inter');
    expect(project.editorial.bodyFontFamily).toBe('Inter');
    project.brand.typography = [];
    project.editorial.displayFontFamily = 'Times New Roman';
    project.credits = { studio: 'Estúdio de demonstração', license: 'CC0' };
    expect(parseProject(project).editorial.displayFontFamily).toBe('Times New Roman');
    expect(parseProject(project).credits.studio).toBe('Estúdio de demonstração');
  });

  it('accepts partial brand language collections without requiring a complete voice workshop', () => {
    const project = createProject('Aurora');
    project.brand.definitions = [{ term: 'Aurora', definition: 'Um começo compartilhado.' }];
    project.brand.narratives = [{ title: 'Começar', text: 'Toda manhã pode aproximar.' }];
    project.brand.mantras = ['Há tempo para começar.'];
    project.brand.dictionary = [{ term: 'pausa', meaning: 'Tempo de presença.', usage: 'Convite acolhedor.' }];
    project.brand.voice = { traits: ['calma'], do: [], avoid: [], modes: [{ id: 'invite', name: 'Convite', do: ['Venha com calma.'], dont: ['Corra!'] }] };
    const parsed = parseProject(project);
    expect(parsed.brand.definitions[0].definition).toBe('Um começo compartilhado.');
    expect(parsed.brand.voice?.modes[0].dont).toEqual(['Corra!']);
    expect(parsed.sections.find(section => section.kind === 'archetypes')?.enabled).toBe(false);
    expect(parsed.sections.some(section => section.kind === 'identity-complete')).toBe(true);
    expect(parsed.sections.some(section => section.kind === 'credits')).toBe(true);
  });

  it.each(['sceneAssetId', 'artworkAssetId', 'maskAssetId', 'overlayAssetId'] as const)('validates a mockup %s reference', key => {
    const project = pageProject();
    project.pages[0].nodes = [{ ...image, type: 'mockup', template: 'custom', [key]: 'missing', children: [] }];
    expect(diagnostics(project)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing-asset', path: `pages.0.nodes.0.${key}` }),
    ]));
  });

  it('preserves four editable local corners and application provenance', () => {
    const project = pageProject();
    project.pages[0].nodes = [{ ...image, type: 'mockup', template: 'poster', children: [], quad: [{ x: 10, y: 20 }, { x: 220, y: 30 }, { x: 210, y: 110 }, { x: 20, y: 100 }], presetId: 'poster-wall', prompt: 'Parede iluminada ao amanhecer.', status: 'draft' }];
    const node = parseProject(project).pages[0].nodes[0];
    expect(node.type).toBe('mockup');
    if (node.type !== 'mockup') throw new Error('Expected mockup');
    expect(node.quad?.[2]).toEqual({ x: 210, y: 110 });
    expect(node.prompt).toBe('Parede iluminada ao amanhecer.');
    expect(node.status).toBe('draft');
  });
});
