import { projectSchema, SCHEMA_VERSION, SECTION_DEFINITIONS, type BrandProject, type Diagnostic } from './schema';
import type { DocumentNode } from './nodes';
export * from './schema';
export type * from './nodes';
export type * from './assets';

export class ProjectValidationError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map(diagnostic => `${diagnostic.path}: ${diagnostic.message}`).join('\n'));
    this.name = 'ProjectValidationError';
  }
}

/** Validate and normalize a document, retaining its existing stable IDs. */
export function parseProject(input: unknown): BrandProject {
  if (typeof input === 'object' && input !== null && 'schemaVersion' in input && input.schemaVersion !== SCHEMA_VERSION) {
    throw new ProjectValidationError([{ code: 'unsupported-version', severity: 'error', path: 'schemaVersion', message: `Versão ${String(input.schemaVersion)} não suportada. Este aplicativo aceita a versão ${SCHEMA_VERSION}.` }]);
  }
  // The short creation form accepts only title. Partial saved documents must not be silently reset.
  const candidate = typeof input === 'object' && input !== null && Object.keys(input).length === 1 && 'title' in input
    ? emptyProject(input.title) : input;
  const result = projectSchema.safeParse(candidate);
  if (!result.success) {
    throw new ProjectValidationError(result.error.issues.map(issue => ({
      code: 'invalid-value', severity: 'error', path: issue.path.join('.'), message: issue.message,
    })));
  }
  const diagnostics = referenceDiagnostics(result.data);
  if (diagnostics.length) throw new ProjectValidationError(diagnostics);
  return result.data;
}

function emptyProject(title: unknown) {
  return {
    schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), title, revision: 0,
    brief: { personality: [], deliverables: [] },
    brand: { name: title, fictitious: false, values: [], colors: [], typography: [], logos: [] },
    assets: [], pages: [], sections: SECTION_DEFINITIONS.map(section => ({
      id: crypto.randomUUID(), kind: section.kind, title: section.title, enabled: !section.optional, status: 'not-started',
      origin: { kind: 'manual' }, approval: { status: 'pending' },
    })),
  };
}
export function createProject(title: string): BrandProject { return parseProject(emptyProject(title)); }

function referenceDiagnostics(project: BrandProject): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ids = new Set<string>();
  const assets = new Set(project.assets.map(asset => asset.id));
  const sections = new Set(project.sections.map(section => section.id));
  const colors = new Set(project.brand.colors.map(color => color.id));
  const typography = new Set(project.brand.typography.map(font => font.id));
  const add = (code: Diagnostic['code'], path: string, message: string) => diagnostics.push({ code, severity: 'error', path, message });
  const unique = (id: string, path: string) => {
    if (ids.has(id)) add('duplicate-id', path, `O ID ${id} está duplicado no documento.`);
    ids.add(id);
  };
  const assetRef = (id: string | undefined, path: string) => {
    if (id !== undefined && !assets.has(id)) add('missing-asset', path, `Asset ${id} não encontrado no projeto.`);
  };
  const sectionRef = (id: string, path: string) => {
    if (!sections.has(id)) add('missing-section', path, `Seção ${id} não encontrada no projeto.`);
  };
  unique(project.id, 'id');
  for (const key of ['assets', 'sections'] as const) project[key].forEach((item, index) => {
    unique(item.id, `${key}.${index}.id`); assetRef(item.origin.assetId, `${key}.${index}.origin.assetId`);
  });
  for (const key of ['colors', 'typography', 'logos'] as const) project.brand[key].forEach((item, index) => {
    const path = `brand.${key}.${index}`;
    unique(item.id, `${path}.id`); assetRef(item.origin.assetId, `${path}.origin.assetId`);
    if ('assetId' in item) assetRef(item.assetId, `${path}.assetId`);
  });
  project.sections.forEach((section, index) => {
    section.content?.assetIds.forEach((id, assetIndex) => assetRef(id, `sections.${index}.content.assetIds.${assetIndex}`));
    section.content?.colorIds.forEach((id, colorIndex) => {
      if (!colors.has(id)) add('missing-color', `sections.${index}.content.colorIds.${colorIndex}`, `Cor ${id} não encontrada no projeto.`);
    });
    section.content?.typographyIds.forEach((id, fontIndex) => {
      if (!typography.has(id)) add('missing-typography', `sections.${index}.content.typographyIds.${fontIndex}`, `Tipografia ${id} não encontrada no projeto.`);
    });
  });
  const visit = (nodes: DocumentNode[], path: string) => nodes.forEach((node, index) => {
    const nodePath = `${path}.${index}`;
    unique(node.id, `${nodePath}.id`); assetRef(node.origin.assetId, `${nodePath}.origin.assetId`);
    if (node.generatedFrom) sectionRef(node.generatedFrom.sectionId, `${nodePath}.generatedFrom.sectionId`);
    if (node.type === 'image') assetRef(node.assetId, `${nodePath}.assetId`);
    if (node.type === 'mockup') {
      for (const key of ['backgroundAssetId', 'sceneAssetId', 'artworkAssetId', 'maskAssetId', 'overlayAssetId'] as const)
        assetRef(node[key], `${nodePath}.${key}`);
    }
    if (node.type === 'group' || node.type === 'mockup') visit(node.children, `${nodePath}.children`);
  });
  project.pages.forEach((page, index) => {
    unique(page.id, `pages.${index}.id`); sectionRef(page.sectionId, `pages.${index}.sectionId`);
    visit(page.nodes, `pages.${index}.nodes`);
  });
  return diagnostics;
}
