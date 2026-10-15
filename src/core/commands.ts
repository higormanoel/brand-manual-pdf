import { parseProject, pageSchema, sectionRecordSchema, type BrandProject, type Page, type SectionRecord, type BrandData, type ProjectBrief, type EditorialConfig, type ProjectCredits } from './project';
import { documentNodeSchema, type DocumentNode, type GroupNode, type MockupNode, type NodeTransform, type Point } from './nodes';
import { assetRecordSchema, type AssetRecord } from './assets';
import { documentDeltaToLocal, nodeBounds, unionBounds, transformMatrix, multiplyMatrices, matrixToTransform } from './geometry';

type PatchFor<T extends DocumentNode> = T extends DocumentNode ? Partial<Omit<T, 'id' | 'type' | 'children' | 'transform' | 'style'>> & { transform?: Partial<NodeTransform> } & (T extends { style: infer S } ? { style?: Partial<S> } : object) : never;
export type NodePatch = PatchFor<DocumentNode>;
export interface ProjectPatch { title?: string; brand?: Partial<BrandData>; brief?: Partial<ProjectBrief>; editorial?: Partial<EditorialConfig>; credits?: Partial<ProjectCredits> }
/** IDs are supplied by callers: replaying a batch produces the same document. Indices refer to the final list. */
export type DocumentCommand =
  | { type: 'project.update'; patch: ProjectPatch }
  | { type: 'project.restore'; project: BrandProject }
  | { type: 'page.insert'; page: Page; index?: number }
  | { type: 'page.update'; pageId: string; patch: Partial<Omit<Page, 'id' | 'nodes'>> }
  | { type: 'page.delete'; pageId: string }
  | { type: 'page.reorder'; pageId: string; index: number }
  | { type: 'page.duplicate'; pageId: string; idMap: Record<string, string>; index?: number }
  | { type: 'node.insert'; pageId: string; parentId?: string; node: DocumentNode; index?: number }
  | { type: 'node.update'; pageId: string; nodeId: string; patch: NodePatch; allowLocked?: boolean }
  | { type: 'node.delete'; pageId: string; nodeId: string }
  | { type: 'node.reorder'; pageId: string; nodeId: string; index: number }
  | { type: 'node.duplicate'; pageId: string; nodeId: string; idMap: Record<string, string>; offset?: Point; index?: number }
  | { type: 'node.move'; pageId: string; nodeIds: string[]; delta: Point; source: 'gesture' | 'keyboard' }
  | { type: 'node.group'; pageId: string; nodeIds: string[]; groupId: string; name?: string }
  | { type: 'node.ungroup'; pageId: string; nodeId: string }
  | { type: 'section.insert'; section: SectionRecord; index?: number }
  | { type: 'section.update'; sectionId: string; patch: Partial<Omit<SectionRecord, 'id'>> }
  | { type: 'section.delete'; sectionId: string }
  | { type: 'section.reorder'; sectionId: string; index: number }
  | { type: 'asset.insert'; asset: AssetRecord; index?: number }
  | { type: 'asset.update'; assetId: string; patch: Partial<Omit<AssetRecord, 'id'>> }
  | { type: 'asset.delete'; assetId: string }
  | { type: 'variant.install'; mode: 'append'; pages: Page[] }
  | { type: 'variant.install'; mode: 'replace'; pages: Page[]; expectedPages: Page[] };
export interface CommandBatch { commandId: string; expectedRevision: number; commands: DocumentCommand[] }
export interface SaveAck { commandId: string; revision: number; project: BrandProject }
export interface NodeLocation { node: DocumentNode; siblings: DocumentNode[]; index: number; ancestors: (GroupNode | MockupNode)[]; page: Page }

export function findPage(project: BrandProject, pageId: string): Page | undefined { return project.pages.find(page => page.id === pageId); }
export function findNode(project: BrandProject, pageId: string, nodeId: string): NodeLocation | undefined {
  const page = findPage(project, pageId);
  if (!page) return undefined;
  const visit = (siblings: DocumentNode[], ancestors: (GroupNode | MockupNode)[]): NodeLocation | undefined => {
    for (let index = 0; index < siblings.length; index++) {
      const node = siblings[index];
      if (node.id === nodeId) return { node, siblings, index, ancestors, page };
      if (node.type === 'group' || node.type === 'mockup') {
        const match = visit(node.children, [...ancestors, node]);
        if (match) return match;
      }
    }
    return undefined;
  };
  return visit(page.nodes, []);
}
function requirePage(project: BrandProject, pageId: string): Page {
  const page = findPage(project, pageId); if (!page) throw new Error(`Page not found: ${pageId}`); return page;
}
function requireNode(project: BrandProject, pageId: string, nodeId: string): NodeLocation {
  const location = findNode(project, pageId, nodeId); if (!location) throw new Error(`Node not found: ${nodeId}`); return location;
}
function locked(location: NodeLocation): boolean { return [location.node, ...location.ancestors].some(node => node.locked); }
function requireUnlocked(location: NodeLocation): void { if (locked(location)) throw new Error(`Node or ancestor is locked: ${location.node.id}`); }
function requireIndex(index: number, length: number, inserting = false): void {
  if (!Number.isInteger(index) || index < 0 || index > length-(inserting ? 0 : 1)) throw new Error(`Invalid index: ${index}`);
}
function insert<T>(list: T[], value: T, index = list.length): void { requireIndex(index, list.length, true); list.splice(index, 0, value); }
function indexById<T extends { id: string }>(list: T[], id: string): number {
  const index = list.findIndex(item => item.id === id); if (index < 0) throw new Error(`Item not found: ${id}`); return index;
}
function reorder<T extends { id: string }>(list: T[], id: string, index: number): void {
  requireIndex(index, list.length); const from = indexById(list, id); const [item] = list.splice(from, 1); list.splice(index, 0, item);
}
function allowKeys(patch: object, keys: string[]): void {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Patch must be an object');
  for (const key of Object.keys(patch)) if (!keys.includes(key)) throw new Error(`Unsupported patch field: ${key}`);
}
function validateNodePatch(node: DocumentNode, patch: NodePatch): void {
  const fields: Record<DocumentNode['type'], string[]> = {
    text: ['text', 'style'], image: ['assetId', 'fit', 'alt', 'crop'], shape: ['shape', 'style', 'path'], group: [],
    mockup: ['template', 'backgroundAssetId', 'sceneAssetId', 'artworkAssetId', 'maskAssetId', 'overlayAssetId', 'quad', 'presetId', 'prompt', 'status'],
  };
  allowKeys(patch, ['name', 'transform', 'opacity', 'visible', 'locked', 'origin', 'approval', 'generatedFrom', 'manuallyEdited', ...fields[node.type]]);
  if (patch.transform !== undefined) allowKeys(patch.transform, ['x', 'y', 'width', 'height', 'rotation', 'scaleX', 'scaleY']);
  if ('style' in patch && patch.style !== undefined) allowKeys(patch.style, node.type === 'text'
    ? ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'color', 'align', 'verticalAlign']
    : ['fill', 'stroke', 'strokeWidth', 'cornerRadius']);
}
function forbidKeys(patch: object, keys: string[]): void {
  for (const key of keys) if (Object.hasOwn(patch, key)) throw new Error(`Cannot update protected field: ${key}`);
}
function mappedId(id: string, map: Record<string, string>): string {
  if (!Object.hasOwn(map, id) || typeof map[id] !== 'string' || !map[id].trim() || map[id] === id) throw new Error(`A fresh ID is required for ${id}`);
  return map[id];
}
function duplicateNode(node: DocumentNode, map: Record<string, string>): DocumentNode {
  const copy = structuredClone(node); copy.id = mappedId(node.id, map); copy.manuallyEdited = true;
  if (copy.type === 'group' || copy.type === 'mockup') copy.children = copy.children.map(child => duplicateNode(child, map));
  return copy;
}
function group(project: BrandProject, command: Extract<DocumentCommand, { type: 'node.group' }>): void {
  if (command.nodeIds.length < 2 || new Set(command.nodeIds).size !== command.nodeIds.length) throw new Error('Grouping requires distinct sibling nodes');
  const locations = command.nodeIds.map(id => requireNode(project, command.pageId, id));
  locations.forEach(requireUnlocked);
  const siblings = locations[0].siblings;
  if (locations.some(location => location.siblings !== siblings)) throw new Error('Grouping requires sibling nodes');
  locations.sort((a, b) => a.index-b.index);
  if (locations.some((location, i) => location.index !== locations[0].index+i)) throw new Error('Grouping noncontiguous layers would change paint order');
  const bounds = unionBounds(locations.map(location => nodeBounds(location.node.transform)));
  const children = locations.map(({ node }) => ({ ...node, transform: { ...node.transform, x: node.transform.x-bounds.x, y: node.transform.y-bounds.y } }));
  const node: GroupNode = { id: command.groupId, name: command.name ?? 'Grupo', type: 'group', opacity: 1, visible: true, locked: false, origin: { kind: 'manual' }, approval: { status: 'pending' }, manuallyEdited: true, transform: { ...bounds, width: Math.max(bounds.width, 1e-9), height: Math.max(bounds.height, 1e-9), rotation: 0, scaleX: 1, scaleY: 1 }, children };
  siblings.splice(locations[0].index, locations.length, node);
}
function ungroup(project: BrandProject, command: Extract<DocumentCommand, { type: 'node.ungroup' }>): void {
  const location = requireNode(project, command.pageId, command.nodeId); requireUnlocked(location);
  const node = location.node;
  if (node.type !== 'group') throw new Error('Only groups can be ungrouped');
  // Group compositing of overlapping children cannot be flattened into per-child opacity.
  if (node.opacity !== 1) throw new Error('Cannot ungroup composited opacity without changing appearance');
  const children = node.children.map(child => ({ ...child, manuallyEdited: true, visible: child.visible && node.visible, transform: matrixToTransform(multiplyMatrices(transformMatrix(node.transform), transformMatrix(child.transform)), child.transform) }));
  location.siblings.splice(location.index, 1, ...children);
}
function installVariant(project: BrandProject, command: Extract<DocumentCommand, { type: 'variant.install' }>): void {
  const pages = command.pages.map(page => pageSchema.parse(page));
  if (!pages.length) throw new Error('A generated variant must contain pages');
  if (command.mode === 'append') { project.pages.push(...pages); return; }
  if (command.mode !== 'replace') throw new Error('Invalid variant install mode');
  const expected = command.expectedPages.map(page => pageSchema.parse(page));
  const ids = new Set(expected.map(page => page.id));
  if (!ids.size || ids.size !== expected.length) throw new Error('Replacement requires distinct observed pages');
  const current = project.pages.filter(page => ids.has(page.id));
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('Pages changed since this variant was observed; review before replacing');
  const index = project.pages.findIndex(page => ids.has(page.id));
  project.pages = project.pages.filter(page => !ids.has(page.id));
  project.pages.splice(index, 0, ...pages);
}

/** Pure and atomic. Validates the whole result; persisted revision belongs to the storage repository. */
export function applyCommands(project: BrandProject, commands: DocumentCommand[]): BrandProject {
  let next = parseProject(project);
  for (const command of commands) {
    switch (command.type) {
      case 'project.restore': {
        const restored = parseProject(command.project);
        if (restored.id !== next.id) throw new Error('Restored snapshot must belong to the same project');
        // Undo/redo restore document content; only the repository advances the confirmed revision.
        next = { ...restored, revision: next.revision };
        break;
      }
      case 'project.update': {
        allowKeys(command.patch, ['title', 'brand', 'brief', 'editorial', 'credits']);
        if (command.patch.title !== undefined) next.title = command.patch.title;
        for (const key of ['brand', 'brief', 'editorial', 'credits'] as const) {
          if (command.patch[key]) Object.assign(next[key], structuredClone(command.patch[key]));
        }
        break;
      }
      case 'page.insert': insert(next.pages, pageSchema.parse(command.page), command.index); break;
      case 'page.update': forbidKeys(command.patch, ['id', 'nodes']); Object.assign(requirePage(next, command.pageId), structuredClone(command.patch)); break;
      case 'page.delete': next.pages.splice(indexById(next.pages, command.pageId), 1); break;
      case 'page.reorder': reorder(next.pages, command.pageId, command.index); break;
      case 'page.duplicate': {
        const page = requirePage(next, command.pageId);
        const copy = { ...page, id: mappedId(page.id, command.idMap), nodes: page.nodes.map(node => duplicateNode(node, command.idMap)) };
        insert(next.pages, copy, command.index ?? indexById(next.pages, page.id)+1); break;
      }
      case 'node.insert': {
        let nodes = requirePage(next, command.pageId).nodes;
        if (command.parentId) {
          const location = requireNode(next, command.pageId, command.parentId); requireUnlocked(location);
          if (location.node.type !== 'group' && location.node.type !== 'mockup') throw new Error('Parent must accept children');
          nodes = location.node.children;
        }
        insert(nodes, documentNodeSchema.parse(command.node), command.index); break;
      }
      case 'node.update': {
        const location = requireNode(next, command.pageId, command.nodeId), patch = structuredClone(command.patch);
        validateNodePatch(location.node, patch);
        // Unlock itself is always explicit. Other edits to locked content need an explicit override.
        if (!command.allowLocked && Object.keys(patch).some(key => key !== 'locked')) requireUnlocked(location);
        const node = location.node;
        const transform = { ...node.transform, ...patch.transform };
        const style = 'style' in node && 'style' in patch ? { ...node.style, ...patch.style } : undefined;
        Object.assign(node, patch, { transform, manuallyEdited: true });
        if (style) Object.assign(node, { style });
        break;
      }
      case 'node.delete': {
        const location = requireNode(next, command.pageId, command.nodeId); requireUnlocked(location); location.siblings.splice(location.index, 1); break;
      }
      case 'node.reorder': {
        const location = requireNode(next, command.pageId, command.nodeId); requireUnlocked(location); reorder(location.siblings, command.nodeId, command.index); break;
      }
      case 'node.duplicate': {
        const location = requireNode(next, command.pageId, command.nodeId); requireUnlocked(location);
        const copy = duplicateNode(location.node, command.idMap);
        if (command.offset) {
          const offset = documentDeltaToLocal(command.offset, location.ancestors.map(node => node.transform)); copy.transform.x += offset.x; copy.transform.y += offset.y;
        }
        insert(location.siblings, copy, command.index ?? location.index+1); break;
      }
      case 'node.move': {
        if (!['gesture', 'keyboard'].includes(command.source) || !Number.isFinite(command.delta.x) || !Number.isFinite(command.delta.y)) throw new Error('Invalid move');
        const selected = new Set(command.nodeIds);
        for (const id of selected) {
          const location = requireNode(next, command.pageId, id);
          if (locked(location) || location.ancestors.some(parent => selected.has(parent.id))) continue;
          const delta = documentDeltaToLocal(command.delta, location.ancestors.map(node => node.transform));
          location.node.transform.x += delta.x; location.node.transform.y += delta.y; location.node.manuallyEdited = true;
        }
        break;
      }
      case 'node.group': group(next, command); break;
      case 'node.ungroup': ungroup(next, command); break;
      case 'section.insert': insert(next.sections, sectionRecordSchema.parse(command.section), command.index); break;
      case 'section.update': forbidKeys(command.patch, ['id']); Object.assign(next.sections[indexById(next.sections, command.sectionId)], structuredClone(command.patch)); break;
      case 'section.delete': next.sections.splice(indexById(next.sections, command.sectionId), 1); break;
      case 'section.reorder': reorder(next.sections, command.sectionId, command.index); break;
      case 'asset.insert': insert(next.assets, assetRecordSchema.parse(command.asset), command.index); break;
      case 'asset.update': forbidKeys(command.patch, ['id', 'bytes']); Object.assign(next.assets[indexById(next.assets, command.assetId)], structuredClone(command.patch)); break;
      case 'asset.delete': next.assets.splice(indexById(next.assets, command.assetId), 1); break;
      case 'variant.install': installVariant(next, command); break;
      default: throw new Error(`Unknown document command: ${String((command as { type?: string }).type)}`);
    }
  }
  return parseProject(next);
}
