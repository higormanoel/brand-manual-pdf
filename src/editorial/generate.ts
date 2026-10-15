import type { BaseNode, BrandColor, BrandProject, BrandTypography, Diagnostic, DocumentNode, Page, SectionRecord, TextStyle } from '../core/project';
import { paginateText, type MeasureText, type TextFragment } from './pagination';
import { CHAPTERS, editorialStyle, NEUTRAL, type EditorialRole } from './neutral';
export interface GeneratedSection { sectionId: string; variantId: string; pages: Page[]; sourceRevision: number }
export interface GenerationResult { sections: GeneratedSection[]; diagnostics: Diagnostic[] }
export interface GenerationOptions { measureText: MeasureText; variantId?: string }
type ContentSource = Pick<BaseNode, 'origin' | 'approval'>;
interface Block { text: string; role: EditorialRole; name: string; style?: TextStyle; source?: ContentSource }
interface Chapter { title: string; number?: string }
const supplied = (value: string | undefined): value is string => Boolean(value?.trim());
const enabled = (section: SectionRecord) => section.enabled && section.status !== 'skipped';

function blocksFor(project: BrandProject, section: SectionRecord): Block[] {
  const blocks: Block[] = [];
  const add = (text: string | undefined, role: EditorialRole = 'body', name: string = role, source?: ContentSource) => {
    if (supplied(text)) blocks.push({ text, role, name: `${name}-${blocks.length}`, source });
  };
  const list = (items: string[], name = 'body') => items.forEach(item => add(item, 'body', name));
  const content = section.content;
  add(content?.heading, 'quote'); add(content?.summary);
  list(content?.paragraphs ?? []);
  if (content?.rules.some(supplied)) { add('Diretrizes', 'caption'); list(content.rules, 'rule'); }
  switch (section.kind) {
    case 'brand-strategy':
      add(project.brief.positioning, 'quote');
      add(project.brand.description);
      add(project.brief.purpose); add(project.brief.audience);
      list(project.brief.personality); list(project.brand.values);
      project.brand.definitions.forEach(item => { add(item.term, 'heading'); add(item.definition); });
      project.brand.narratives.forEach(item => { add(item.title, 'heading'); add(item.text); });
      project.brand.mantras.forEach(item => add(item, 'quote'));
      project.brand.dictionary.forEach(item => { add(item.term, 'heading'); add(item.meaning); add(item.usage); });
      break;
    case 'voice': {
      const voice = project.brand.voice;
      if (!voice) break;
      list(voice.traits);
      if (voice.do.some(supplied)) { add('Como escrever', 'heading'); list(voice.do, 'guideline-do'); }
      if (voice.avoid.some(supplied)) { add('Evitar', 'heading'); list(voice.avoid, 'guideline-avoid'); }
      if (supplied(voice.sample)) { add('Exemplo de voz', 'caption'); add(voice.sample, 'quote'); }
      voice.modes.forEach(mode => {
        add(mode.name, 'heading'); add(mode.description);
        if (mode.do.some(supplied)) { add('Como escrever', 'caption'); list(mode.do, 'guideline-do'); }
        if (mode.dont.some(supplied)) { add('Evitar', 'caption'); list(mode.dont, 'guideline-avoid'); }
        mode.examples?.forEach(example => {
          if (supplied(example.wrong)) { add('Exemplo incorreto', 'caption'); add(example.wrong, 'body', 'example-wrong'); }
          if (supplied(example.right)) { add('Exemplo correto', 'caption'); add(example.right, 'body', 'example-right'); }
          add(example.explanation);
        });
      });
      break;
    }
    case 'logo': add(project.brand.tagline, 'quote'); break;
    case 'clear-space':
      project.brand.logos.forEach(logo => {
        if (logo.clearSpace !== undefined || logo.minWidth !== undefined) add(logo.name, 'heading', 'logo-rule-name', logo);
        if (logo.clearSpace !== undefined) add(`Área de proteção: ${logo.clearSpace}.`, 'body', 'provided-clear-space', logo);
        if (logo.minWidth !== undefined) add(`Largura mínima: ${logo.minWidth} px.`, 'body', 'provided-min-width', logo);
      });
      break;
    case 'credits': {
      const credits = project.credits;
      [credits.studio, credits.author, credits.handle, credits.website].forEach(value => add(value));
      credits.contributors?.forEach(person => { add(person.name, 'heading'); add(person.role); });
      add(credits.license); add(credits.notes);
      break;
    }
  }
  return blocks;
}

/** The proposal builder has no access to storage/history and cannot replace an
 * existing page. IDs are stable inside an explicitly named generation variant.
 */
class SectionLayout {
  readonly pages: Page[] = [];
  constructor(readonly project: BrandProject, readonly source: SectionRecord, readonly variant: string, readonly options: GenerationOptions, readonly diagnostics: Diagnostic[], readonly chapter: Chapter) {}
  style(role: EditorialRole, dark = false) { return editorialStyle(this.project.editorial, role, dark); }
  base(page: Page, name: string, x: number, y: number, width: number, height: number, source: ContentSource = this.source): BaseNode {
    return {
      id: `${page.id}:node:${page.nodes.length}:${name}`, name,
      transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
      opacity: 1, visible: true, locked: false,
      origin: structuredClone(source.origin),
      // An approved container cannot approve a pending item, and a pending
      // section remains pending even when its individual item was approved.
      approval: structuredClone(source.approval.status === 'pending' ? source.approval : this.source.approval.status === 'pending' ? this.source.approval : source.approval),
      generatedFrom: { sectionId: this.source.id, revision: this.project.revision },
    };
  }
  pushText(page: Page, fragment: TextFragment, style: TextStyle, name: string, x: number, y: number, width: number, source?: ContentSource) {
    const node: DocumentNode = { ...this.base(page, name, x, y, width, Math.max(1, Math.ceil(Math.max(fragment.measurement.height, fragment.measurement.scrollHeight))), source), type: 'text', text: fragment.text, style: { ...style } };
    page.nodes.push(node);
    if (!fragment.measurement.fontAvailable) this.diagnostics.push({ code: 'font-substitution', severity: 'warning', path: `pages.${page.id}.nodes.${node.id}`, message: `A fonte ${style.fontFamily} não está disponível para este texto.` });
    return node.transform.height;
  }
  async text(page: Page, text: string, role: EditorialRole, name: string, x: number, y: number, width: number, height: number, dark = false) {
    const fragments = await paginateText(text, { measureText: this.options.measureText, style: this.style(role, dark), width, height });
    if (fragments.length > 1) throw new RangeError(`O rótulo editorial ${name} não cabe na caixa.`);
    if (fragments[0]) this.pushText(page, fragments[0], this.style(role, dark), name, x, y, width);
  }
  shape(page: Page, name: string, x: number, y: number, width: number, height: number, fill: string, source?: ContentSource) {
    page.nodes.push({ ...this.base(page, name, x, y, width, height, source), type: 'shape', shape: 'rectangle', style: { fill, stroke: 'none', strokeWidth: 0, cornerRadius: 0 } });
  }
  async page(title: string, dark = false): Promise<Page> {
    const page: Page = { id: `${this.variant}:${this.source.id}:page:${this.pages.length}`, sectionId: this.source.id, title, width: NEUTRAL.width, height: NEUTRAL.height, background: dark ? NEUTRAL.dark : NEUTRAL.light, nodes: [] };
    this.pages.push(page);
    const ink = dark ? NEUTRAL.light : NEUTRAL.ink;
    this.shape(page, 'header-rule', 91, 177, 1738, 1, ink);
    this.shape(page, 'footer-rule', 91, 970, 1738, 1, ink);
    await this.text(page, this.chapter.title, 'caption', 'running-header', 91, 122, 1600, 40, dark);
    // Physical page numbers are installed after all chapters have been composed.
    return page;
  }
  async opener() {
    const page = await this.page(this.chapter.title, true);
    const titleStyle = this.style('display', true);
    const numberStyle = { ...titleStyle, color: NEUTRAL.muted };
    const title = await paginateText(this.chapter.title, { measureText: this.options.measureText, style: titleStyle, width: 1500, height: 500 });
    const number = await paginateText(this.chapter.number!, { measureText: this.options.measureText, style: numberStyle, width: 300, height: 150 });
    if (title.length !== 1 || number.length !== 1) throw new RangeError('A abertura exige título e número que caibam no conjunto editorial.');
    const height = (fragment: TextFragment) => Math.ceil(Math.max(fragment.measurement.height, fragment.measurement.scrollHeight));
    const titleY = NEUTRAL.bodyBottom - height(title[0]);
    const numberY = titleY - 24 - height(number[0]);
    this.pushText(page, number[0], numberStyle, 'chapter-number', 91, numberY, 300);
    this.pushText(page, title[0], titleStyle, 'chapter-title', 91, titleY, 1500);
  }
  async flow(blocks: Block[], title = this.source.title, leftColor?: BrandColor) {
    if (!blocks.length) return;
    let page: Page;
    let y = NEUTRAL.bodyTop as number;
    const next = async () => {
      page = await this.page(title);
      y = NEUTRAL.bodyTop;
      if (leftColor) this.shape(page, `swatch-${leftColor.id}`, 91, 260, 530, 530, leftColor.hex, leftColor);
      else {
        await this.text(page, this.chapter.number ?? '', 'display', 'content-number', 91, 260, 530, 110);
        await this.text(page, this.chapter.title, 'heading', 'content-chapter', 91, 390, 530, 450);
      }
    };
    await next();
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const style = block.style ?? this.style(block.role);
      // Avoid an isolated label at the foot of a page whenever a following line
      // is known. All remaining capacity is still determined by measurement.
      const min = style.fontSize * style.lineHeight + (block.role === 'caption' && index < blocks.length - 1 ? 70 : 0);
      if (NEUTRAL.bodyBottom - y < min) await next();
      const fragments = await paginateText(block.text, { measureText: this.options.measureText, style, width: NEUTRAL.bodyWidth, height: NEUTRAL.bodyBottom - y, continuationHeight: NEUTRAL.bodyBottom - NEUTRAL.bodyTop });
      for (let part = 0; part < fragments.length; part++) {
        if (part) await next();
        y += this.pushText(page!, fragments[part], style, `${block.name}-${part}`, NEUTRAL.bodyX, y, NEUTRAL.bodyWidth, block.source) + (block.role === 'caption' ? 16 : 32);
      }
    }
  }
  async cover() {
    const blocks: Block[] = [{ text: this.project.brand.name, role: 'display', name: 'cover-brand' }];
    if (supplied(this.project.brand.tagline)) blocks.push({ text: this.project.brand.tagline, role: 'body', name: 'cover-tagline' });
    let page = await this.page('Capa', true), y = 340;
    for (const block of blocks) {
      const style = this.style(block.role, true);
      if (900 - y < style.fontSize * style.lineHeight) { page = await this.page('Capa — continuação', true); y = 340; }
      const fragments = await paginateText(block.text, { measureText: this.options.measureText, style, width: 1500, height: 900 - y, continuationHeight: 560 });
      for (let part = 0; part < fragments.length; part++) {
        if (part) { page = await this.page('Capa — continuação', true); y = 340; }
        y += this.pushText(page, fragments[part], style, `${block.name}-${part}`, 91, y, 1500) + 48;
      }
    }
  }
  async images(ids: string[]) {
    for (const id of [...new Set(ids)]) {
      const asset = this.project.assets.find(item => item.id === id);
      if (!asset) {
        this.diagnostics.push({ code: 'missing-asset', severity: 'error', path: `sections.${this.source.id}`, message: `Asset ${id} não encontrado.` });
        continue;
      }
      const logo = this.project.brand.logos.find(item => item.assetId === id);
      // A logo carries its own approval. Standalone assets have no approval
      // field; a suggested asset cannot acquire approval from its container.
      const source: ContentSource = logo ?? { origin: asset.origin, approval: asset.origin.kind === 'suggested' ? { status: 'pending' } : this.source.approval };
      const page = await this.page(this.source.title);
      await this.text(page, this.chapter.title, 'heading', 'image-chapter', 91, 260, 460, 450);
      if (logo?.background === 'dark') this.shape(page, 'logo-background', 640, 240, 1189, 590, NEUTRAL.dark, source);
      page.nodes.push({ ...this.base(page, 'provided-image', 680, 280, 1109, 510, source), type: 'image', assetId: id, fit: 'contain', alt: asset.name });
      // Captions also use measured flow: a long filename is ordinary editable
      // text and continues, rather than being clipped under an image.
      const captions = await paginateText(logo?.name ?? asset.name, { measureText: this.options.measureText, style: this.style('caption'), width: 1189, height: 90, continuationHeight: 670 });
      this.pushText(page, captions[0], this.style('caption'), 'image-caption', 640, 850, 1189, source);
      if (captions.length > 1) await this.flow(captions.slice(1).map((part, index) => ({ text: part.text, role: 'caption', name: `image-caption-continuation-${index}`, source })));
    }
  }
  async color(color: BrandColor) {
    const blocks: Block[] = [
      { text: color.name, role: 'heading', name: 'color-name' },
      { text: color.hex, role: 'quote', name: 'color-code' },
      { text: color.role, role: 'caption', name: 'color-role' },
    ];
    if (supplied(color.usage)) blocks.push({ text: color.usage, role: 'body', name: 'color-usage' });
    await this.flow(blocks.map(block => ({ ...block, source: color })), color.name, color);
  }
  async specimen(font: BrandTypography) {
    const family = `${JSON.stringify(font.family)}, ${font.fallback}`;
    const identity: Block[] = [{ text: font.family, role: 'heading', name: 'type-family', source: font }, { text: font.role, role: 'caption', name: 'type-role', source: font }];
    if (!font.weights.length) await this.flow(identity, font.family);
    for (const weight of font.weights) {
      await this.flow([
        ...identity,
        { text: `${weight}`, role: 'caption', name: `type-weight-${weight}`, source: font },
        { text: `${this.project.brand.name}\nABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789`, role: 'quote', name: `specimen-${font.id}-${weight}`, style: { ...this.style('quote'), fontFamily: family, fontWeight: weight }, source: font },
      ], font.family);
    }
  }
}

export async function generateManual(project: BrandProject, options: GenerationOptions): Promise<GenerationResult> {
  const variant = options.variantId ?? crypto.randomUUID();
  if (!variant.trim()) throw new Error('A variante exige um ID não vazio.');
  const result: GenerationResult = { sections: [], diagnostics: [] };
  const layout = (section: SectionRecord, chapter: Chapter) => new SectionLayout(project, section, variant, options, result.diagnostics, chapter);
  const finish = (builder: SectionLayout) => {
    if (builder.pages.length) result.sections.push({ sectionId: builder.source.id, variantId: variant, pages: builder.pages, sourceRevision: project.revision });
  };
  const intro = project.sections.find(section => section.kind === 'introduction');
  if (!intro) return { sections: [], diagnostics: [{ code: 'missing-section', severity: 'error', path: 'sections', message: 'A capa exige uma seção de origem introduction no documento.' }] };
  const cover = layout(intro, { title: 'Manual de identidade' });
  await cover.cover();
  if (intro.kind === 'introduction' && enabled(intro)) await cover.flow(blocksFor(project, intro));
  finish(cover);

  const visuals = (section: SectionRecord) => {
    const colors = section.kind === 'colors' ? project.brand.colors.filter(color => !section.content?.colorIds.length || section.content.colorIds.includes(color.id)) : [];
    const fonts = section.kind === 'typography' ? project.brand.typography.filter(font => !section.content?.typographyIds.length || section.content.typographyIds.includes(font.id)) : [];
    const images = [...(section.content?.assetIds ?? []), ...(section.kind === 'logo' ? project.brand.logos.map(logo => logo.assetId) : [])];
    return { colors, fonts, images };
  };
  let chapterNumber = 0;
  for (const chapter of CHAPTERS) {
    const sources = chapter.kinds.flatMap(kind => project.sections.filter(s => s.kind === kind && enabled(s))).map(source => ({ source, blocks: blocksFor(project, source), ...visuals(source) })).filter(item => item.blocks.length || item.colors.length || item.fonts.length || item.images.length);
    if (!sources.length) continue;
    const number = String(++chapterNumber).padStart(3, '0');
    for (let index = 0; index < sources.length; index++) {
      const item = sources[index], builder = layout(item.source, { title: chapter.title, number });
      if (!index) await builder.opener();
      await builder.flow(item.blocks);
      await builder.images(item.images);
      for (const color of item.colors) await builder.color(color);
      for (const font of item.fonts) await builder.specimen(font);
      finish(builder);
    }
  }
  // Optional extras follow the complete principal sequence and don't alter its
  // numbering. They never derive content solely from brand values.
  for (const kind of ['archetypes', 'pillars', 'credits'] as const) {
    for (const source of project.sections.filter(s => s.kind === kind && enabled(s))) {
      const builder = layout(source, { title: source.title });
      await builder.flow(blocksFor(project, source)); await builder.images(source.content?.assetIds ?? []); finish(builder);
    }
  }
  let pageNumber = 0;
  for (const section of result.sections) for (const page of section.pages) {
    const builder = layout(project.sections.find(s => s.id === section.sectionId)!, { title: '' });
    await builder.text(page, String(++pageNumber).padStart(3, '0'), 'caption', 'page-number', 1720, 998, 109, 30, page.background === NEUTRAL.dark);
  }
  return result;
}
