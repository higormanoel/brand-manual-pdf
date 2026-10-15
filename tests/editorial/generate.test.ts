import { describe, expect, test } from 'vitest';
import fixture from '../../fixtures/aurora/project.json';
import { createProject, parseProject, type BrandProject, type TextNode } from '../../src/core/project';
import { generateManual } from '../../src/editorial/generate';
import { paginateText, type MeasureText } from '../../src/editorial/pagination';

// A deterministic measurement boundary for unit tests. Actual browser wrapping is
// tested separately; production pagination must query the supplied measurement.
const measureText: MeasureText = async ({ text, width, height, style }) => {
  const intrinsic = Math.max(1, text.split('\n').reduce((n, line) => n + Math.ceil(line.length * style.fontSize / (width / 0.55)), 0)) * style.fontSize * style.lineHeight;
  return { width, height: intrinsic, scrollWidth: width, scrollHeight: Math.ceil(intrinsic), overflow: height !== undefined && intrinsic > height + .5, fontAvailable: true };
};
const generate = (project: BrandProject) => generateManual(project, { measureText, variantId: 'proof' });
const texts = (result: Awaited<ReturnType<typeof generateManual>>) => result.sections.flatMap(s => s.pages.flatMap(p => p.nodes.filter((n): n is TextNode => n.type === 'text').map(n => n.text)));

test('parsing preserves optional supplied voice example pairs without adding them to older projects', () => {
  const input = structuredClone(fixture);
  Object.assign(input.brand.voice.modes[0], { examples: [{ wrong: 'Corra!', right: 'Venha no seu tempo.', explanation: 'Respeitar o ritmo.' }] });
  expect(parseProject(input).brand.voice!.modes[0]).toHaveProperty('examples', [{ wrong: 'Corra!', right: 'Venha no seu tempo.', explanation: 'Respeitar o ritmo.' }]);
  expect(parseProject(fixture).brand.voice!.modes[0]).not.toHaveProperty('examples');
});

describe('editorial proposals', () => {
  test('makes a coherent editable cover from a name without empty chapters or attributed credits', async () => {
    const project = createProject('Casa do Sol');
    const result = await generate(project);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].pages).toHaveLength(1);
    expect(texts(result)).toContain('Casa do Sol');
    expect(texts(result).join(' ')).not.toMatch(/Marquio|\[.*\]/);
    expect(result.sections[0].pages[0].nodes.some(n => n.type === 'shape')).toBe(true);
    expect(project.pages).toEqual([]);
    expect(() => parseProject({ ...project, pages: result.sections.flatMap(s => s.pages) })).not.toThrow();
  });

  test('keeps the implicit cover when every collection section was skipped', async () => {
    const project = parseProject(fixture);
    project.sections.forEach(s => { s.status = 'skipped'; });
    const result = await generate(project);
    expect(result.sections.flatMap(s => s.pages)).toHaveLength(1);
    expect(texts(result)).toContain('Aurora');
  });

  test('reports a missing introduction source instead of proposing orphan or duplicate section pages', async () => {
    const project = createProject('Vereda');
    project.sections = project.sections.filter(s => s.kind !== 'introduction');
    const result = await generate(project);
    expect(result.sections).toEqual([]);
    expect(result.diagnostics[0].code).toBe('missing-section');
  });

  test('orders full chapters while voice and logo rules retain their source sections', async () => {
    const project = parseProject(fixture);
    const result = await generate(project);
    expect(result.sections.map(s => project.sections.find(source => source.id === s.sectionId)!.kind)).toEqual([
      'introduction', 'brand-strategy', 'voice', 'logo', 'clear-space', 'incorrect-usage',
      'photography', 'colors', 'typography', 'graphic-elements', 'applications', 'identity-complete', 'archetypes', 'pillars', 'credits',
    ]);
    const chapters = result.sections.flatMap(s => s.pages.flatMap(p => p.nodes.filter(n => n.name === 'chapter-number' && n.type === 'text').map(n => (n as TextNode).text)));
    expect(chapters).toEqual(['001', '002', '003', '004', '005', '006', '007', '008']);
    expect(texts(result)).toContain('Atenção às pessoas, ao tempo e aos pequenos rituais.');
    expect(texts(result)).toContain('Há tempo para começar.');
    expect(texts(result)).toContain('Venha com calma.');
    expect(result.sections.flatMap(s => s.pages.flatMap(p => p.nodes)).filter(n => n.type === 'image').map(n => n.assetId)).toEqual(expect.arrayContaining(['asset-logo', 'asset-logo-reversed', 'asset-symbol', 'asset-landscape', 'asset-pattern']));
    expect(() => parseProject({ ...project, pages: result.sections.flatMap(s => s.pages) })).not.toThrow();
  });

  test('renders voice guidelines and supplied paired examples without inventing pairs', async () => {
    const project = createProject('Vereda');
    project.brand.voice = { traits: ['Clara'], do: ['Explicar'], avoid: ['Jargão'], modes: [{ id: 'mode', name: 'Acolhimento', do: ['Use verbos concretos'], dont: ['Evite pressão'], examples: [{ wrong: 'Corra!', right: 'Venha no seu tempo.', explanation: 'Respeitar o ritmo.' }] }] };
    const result = await generate(parseProject(project));
    expect(texts(result)).toEqual(expect.arrayContaining(['Use verbos concretos', 'Evite pressão', 'Corra!', 'Venha no seu tempo.', 'Respeitar o ritmo.']));
    expect(result.sections).toHaveLength(2);
    expect(result.sections.flatMap(s => s.pages.flatMap(p => p.nodes)).filter(n => n.name === 'chapter-number')).toHaveLength(1);
    expect(parseProject(project).brand.voice!.modes[0].examples).toEqual([{ wrong: 'Corra!', right: 'Venha no seu tempo.', explanation: 'Respeitar o ritmo.' }]);
    expect(parseProject(fixture).brand.voice!.modes[0].examples).toBeUndefined();
  });

  test('numbers a palette without a logo as the first chapter and respects skipped content', async () => {
    const project = createProject('Vereda');
    project.brand.colors = parseProject(fixture).brand.colors.slice(0, 1);
    const result = await generate(project);
    expect(result.sections).toHaveLength(2);
    expect(texts(result)).toContain('001');
    expect(result.sections.flatMap(s => s.pages.flatMap(p => p.nodes)).filter((n): n is TextNode => n.type === 'text' && n.name === 'chapter-number').map(n => n.text)).toEqual(['001']);
    expect(result.sections.flatMap(s => s.pages.flatMap(p => p.nodes)).some(n => n.type === 'shape' && n.style.fill === '#283E36')).toBe(true);
    project.sections.find(s => s.kind === 'colors')!.status = 'skipped';
    expect((await generate(project)).sections).toHaveLength(1);
  });

  test('keeps optional extras out until enabled and never creates logo construction rules', async () => {
    const project = createProject('Vereda');
    const extra = project.sections.find(s => s.kind === 'archetypes')!;
    extra.content = { heading: 'Explorador', paragraphs: [], rules: [], assetIds: [], colorIds: [], typographyIds: [] };
    expect((await generate(project)).sections).toHaveLength(1);
    extra.enabled = true;
    expect(texts(await generate(project))).toContain('Explorador');
    project.brand.logos = parseProject(fixture).brand.logos.slice(1, 2);
    project.assets = parseProject(fixture).assets;
    expect(texts(await generate(project)).join(' ')).not.toMatch(/proteção|mínima|construção/i);
  });

  test('returns deterministic proposals per requested variant and leaves manual pages intact', async () => {
    const project = createProject('Casa do Sol');
    const first = await generate(project);
    project.pages = structuredClone(first.sections[0].pages);
    (project.pages[0].nodes.find(n => n.type === 'text') as TextNode).text = 'Edição preservada';
    project.revision = 9;
    const before = structuredClone(project);
    const next = await generateManual(project, { measureText, variantId: 'new-proof' });
    expect(project).toEqual(before);
    expect(next.sections[0].sourceRevision).toBe(9);
    expect(next.sections[0].pages[0].id).not.toBe(first.sections[0].pages[0].id);
    expect(await generate(project)).toEqual(await generate(project));
    const a = await generateManual(project, { measureText });
    const b = await generateManual(project, { measureText });
    expect(a.sections[0].variantId).not.toBe(b.sections[0].variantId);
  });

  test('keeps editorial families independent from brand specimens and reports substitution', async () => {
    const project = parseProject(fixture);
    project.editorial.bodyFontFamily = 'Uploaded Editorial';
    const result = await generateManual(project, { variantId: 'font-proof', measureText: async request => ({ ...await measureText(request), fontAvailable: !request.style.fontFamily.startsWith('Uploaded Editorial') }) });
    const nodes = result.sections.flatMap(s => s.pages.flatMap(p => p.nodes)).filter((n): n is TextNode => n.type === 'text');
    expect(nodes.some(n => n.name.startsWith('body') && n.style.fontFamily.startsWith('Uploaded Editorial'))).toBe(true);
    expect(nodes.some(n => n.name.startsWith('specimen') && n.style.fontFamily.startsWith('"Georgia"'))).toBe(true);
    expect(result.diagnostics.some(d => d.code === 'font-substitution')).toBe(true);
  });

  test('places an explicit Inter fallback after a missing editorial family', async () => {
    const project = createProject('Vereda');
    project.editorial.displayFontFamily = 'Missing Editorial';
    const result = await generate(project);
    const name = result.sections[0].pages.flatMap(p => p.nodes).find((n): n is TextNode => n.type === 'text' && n.text === 'Vereda')!;
    expect(name.style.fontFamily).toBe('Missing Editorial, Inter, sans-serif');
  });

  test('keeps each measured brand weight specimen whole on its own composition', async () => {
    const result = await generate(parseProject(fixture));
    const specimens = result.sections.flatMap(s => s.pages.flatMap(p => p.nodes)).filter((n): n is TextNode => n.type === 'text' && n.name.startsWith('specimen'));
    expect(specimens).toHaveLength(4);
    expect(specimens.every(n => n.text === 'Aurora\nABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789')).toBe(true);
  });
});

test('pagination uses supplied measured fit and preserves whitespace and grapheme clusters', async () => {
  const style = { fontFamily: 'Inter', fontSize: 21, fontWeight: 400, fontStyle: 'normal' as const, lineHeight: 1.5, letterSpacing: 0, color: '#0F0F0F', align: 'left' as const, verticalAlign: 'top' as const };
  const text = '  começo\n\n👩🏽‍💻 atenção e cafe\u0301. '.repeat(20);
  const pages = await paginateText(text, { style, width: 150, height: 180, measureText });
  expect(pages.length).toBeGreaterThan(1);
  expect(pages.map(p => p.text).join('')).toBe(text);
  expect(pages.every(p => p.measurement.height <= 180.5 && !p.measurement.overflow)).toBe(true);
  expect(pages.some(p => /\u200d$/.test(p.text))).toBe(false);
  await expect(paginateText('x', { style, width: 150, height: 1, measureText })).rejects.toThrow(/fit|cabe|caixa/i);
});
