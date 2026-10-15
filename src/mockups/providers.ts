import type { ResolvedPrompt } from './prompts';

export interface MockupRequest {
  presetId: string;
  presetVersion: number;
  prompt: string;
  assetIds: string[];
  output: 'scene' | 'finished-image';
}
export interface MockupResult {
  image: Blob;
  kind: 'scene' | 'finished-image';
  model: string;
  provenance: MockupRequest & { providerId: string; generatedAt: string };
  review: 'pending' | 'approved';
}
/** Optional adapter resolves the explicitly selected asset IDs; it never receives a project to edit. */
export interface MockupProvider {
  id: string;
  name: string;
  generate(request: MockupRequest): Promise<MockupResult>;
}

export function createMockupRequest(resolved: ResolvedPrompt): MockupRequest {
  if (resolved.status !== 'ready' || !resolved.prompt || /\{\{|\}\}/.test(resolved.prompt))
    throw new Error('O prompt está incompleto. Envie os arquivos ou preencha os campos indicados.');
  return { presetId: resolved.presetId, presetVersion: resolved.presetVersion, prompt: resolved.prompt,
    assetIds: [...resolved.usedAssetIds], output: resolved.mode === 'scene' ? 'scene' : 'finished-image' };
}

export async function generateMockup(request: MockupRequest, provider?: MockupProvider): Promise<MockupResult> {
  if (!provider) throw new Error('Nenhum provedor configurado. Copie ou baixe o prompt e importe a imagem produzida.');
  if (!request.prompt.trim() || /\{\{|\}\}/.test(request.prompt)) throw new Error('O prompt está incompleto.');
  // Isolate adapters from the request held by the interface. A result never approves itself.
  const result = await provider.generate({ ...request, assetIds: [...request.assetIds] });
  if (!(result.image instanceof Blob) || !result.image.size || !result.image.type.startsWith('image/'))
    throw new Error('O provedor não retornou uma imagem válida. Tente novamente ou importe um arquivo.');
  if (result.kind !== request.output || !result.model.trim() || !Number.isFinite(Date.parse(result.provenance.generatedAt)))
    throw new Error('O provedor retornou uma imagem sem metadados de geração válidos.');
  return { ...result, review: 'pending', provenance: { ...request, assetIds: [...request.assetIds], providerId: provider.id, generatedAt: result.provenance.generatedAt } };
}
