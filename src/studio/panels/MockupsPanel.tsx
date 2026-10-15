import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import type { AssetRecord, BrandProject, MockupNode, ProjectionQuad } from '../../core/project';
import { MOCKUP_PRESETS, getMockupPreset } from '../../mockups/presets';
import { resolveMockupPrompt, type PromptAsset } from '../../mockups/prompts';
import { createMockupRequest, generateMockup, type MockupProvider, type MockupResult } from '../../mockups/providers';
import { BUILTIN_MOCKUP_SCENES, createFinalImageMockup, createSceneMockup } from '../../mockups/scenes';
import { NodeRenderer } from '../../render/NodeRenderer';
import './MockupsPanel.css';

export interface MockupsPanelProps {
  project: BrandProject;
  resolveAsset: (id: string) => string | undefined;
  /** The host inserts into the selected artboard through its history/command system. */
  onInsert: (node: MockupNode) => void;
  /** Persist bytes and register the returned asset in the project before resolving. */
  onImportAsset: (file: File) => Promise<AssetRecord>;
  onCopy?: (text: string) => Promise<void>;
  provider?: MockupProvider;
  initialPresetId?: string;
  initialMode?: 'scene' | 'application';
}
interface PanelLifetime { disposed: boolean; urls: Set<string> }
type AssetSlot = 'scene' | 'artwork' | 'logo' | 'portrait' | 'mask' | 'overlay' | 'final';
const CORNER_NAMES = ['Superior esquerdo', 'Superior direito', 'Inferior direito', 'Inferior esquerdo'];
const blankCorners = () => CORNER_NAMES.map(() => ({ x: '', y: '' }));

/** A self-contained panel; generation/import never inserts a document node without approval. */
export function MockupsPanel({ project, resolveAsset, onInsert, onImportAsset, onCopy, provider, initialPresetId = 'card-stack', initialMode = 'application' }: MockupsPanelProps) {
  const scope = useId();
  const [presetId, setPresetId] = useState(initialPresetId);
  const [mode, setMode] = useState<'scene' | 'application'>(initialMode);
  const [selected, setSelected] = useState<Partial<Record<AssetSlot, string>>>({});
  const [imported, setImported] = useState<AssetRecord[]>([]);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const lifetime = useRef<PanelLifetime>({ disposed: false, urls: new Set() });
  const [sceneSize, setSceneSize] = useState<{ width: number; height: number }>();
  const [corners, setCorners] = useState(blankCorners);
  const [nextCorner, setNextCorner] = useState(0);
  const [surfaceId, setSurfaceId] = useState('');
  const [material, setMaterial] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [sceneVariant, setSceneVariant] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState<MockupResult>();
  const [sceneProvenance, setSceneProvenance] = useState('');
  const [finalProvenance, setFinalProvenance] = useState('');
  const photoRef = useRef<HTMLImageElement>(null);
  const preset = getMockupPreset(presetId);
  const builtin = BUILTIN_MOCKUP_SCENES.find(scene => scene.id === preset.builtinSceneId);
  const assets = useMemo(() => [...new Map([...project.assets, ...imported].map(asset => [asset.id, asset])).values()], [project.assets, imported]);
  const images = assets.filter(asset => asset.mimeType.startsWith('image/'));
  const asset = (slot: AssetSlot) => assets.find(item => item.id === selected[slot]);
  const promptAsset = (slot: AssetSlot): PromptAsset | undefined => {
    const record = asset(slot);
    return record ? { assetId: record.id, name: record.name } : undefined;
  };
  const src = (id: string | undefined) => id ? resolveAsset(id) ?? localUrls[id] : undefined;
  const prepared = resolveMockupPrompt(presetId, {
    mode, sceneAsset: promptAsset('scene'), artworkAsset: promptAsset('artwork'), logoAsset: promptAsset('logo'),
    ...(presetId === 'portrait-badge' ? { portraitAsset: promptAsset('portrait') } : {}),
    aspectRatio, ...(material.trim() ? { material } : {}), ...(sceneVariant.trim() ? { sceneVariant } : {}),
  });
  useEffect(() => {
    // Strict Mode replays effects: a fresh lifetime must not revive earlier async work.
    if (lifetime.current.disposed) lifetime.current = { disposed: false, urls: new Set() };
    const session = lifetime.current;
    return () => {
      session.disposed = true;
      session.urls.forEach(url => URL.revokeObjectURL(url));
      session.urls.clear();
    };
  }, []);

  let candidate: MockupNode | undefined;
  let placementError = '';
  if (preset.application === 'planar' && selected.scene && selected.artwork && sceneSize && corners.every(point => point.x !== '' && point.y !== '')) {
    try {
      candidate = createSceneMockup({ presetId, sceneAssetId: selected.scene, artworkAssetId: selected.artwork,
        sceneWidth: sceneSize.width, sceneHeight: sceneSize.height,
        corners: corners.map(point => ({ x: Number(point.x), y: Number(point.y) })) as ProjectionQuad,
        maskAssetId: selected.mask, overlayAssetId: selected.overlay,
        prompt: prepared.prompt,
      });
    } catch (cause) { placementError = message(cause); }
  }
  const finalAsset = asset('final');
  const imageReady = Boolean(finalAsset);

  function choosePreset(id: string) {
    setPresetId(id); setSelected({}); setSceneSize(undefined); setCorners(blankCorners());
    setNextCorner(0); setSurfaceId(''); setGeneration(undefined); setSceneProvenance(''); setFinalProvenance(''); setNotice(''); setError('');
    setMaterial(''); setSceneVariant('');
  }
  function chooseScene(id: string) {
    const record = assets.find(item => item.id === id);
    setSelected(previous => ({ ...previous, scene: id || undefined, final: undefined }));
    setSceneSize(record?.width && record.height ? { width: record.width, height: record.height } : undefined);
    setCorners(blankCorners()); setSurfaceId(''); setNextCorner(0); setSceneProvenance('');
    setNotice(id ? 'Marque os quatro cantos da superfície antes de inserir.' : ''); setError('');
  }
  function chooseSurface(id: string) {
    if (id === '') { setSurfaceId(''); return; }
    const surface = builtin?.surfaces.find(item => item.id === id);
    if (!surface) return;
    setSurfaceId(id); setCorners(surface.corners.map(point => ({ x: String(point.x), y: String(point.y) })));
  }
  async function run(operation: string, action: (session: PanelLifetime) => Promise<void>) {
    const session = lifetime.current;
    if (session.disposed) return;
    setBusy(operation); setError(''); setNotice('');
    try { await action(session); }
    catch (cause) { if (!session.disposed) setError(message(cause)); }
    finally { if (!session.disposed) setBusy(''); }
  }
  async function importImage(file: File, slot: AssetSlot, session: PanelLifetime) {
    if (session.disposed) return;
    if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem válido.');
    const size = await imageDimensions(file, session);
    if (!size || session.disposed) return;
    const record = await onImportAsset(file);
    if (session.disposed) return;
    const url = allocateLifetimeUrl(file, session);
    if (!url) return;
    setImported(previous => [...previous.filter(item => item.id !== record.id), { ...record, ...size }]);
    setLocalUrls(previous => ({ ...previous, [record.id]: url }));
    setSelected(previous => ({ ...previous, [slot]: record.id }));
    if (slot === 'scene') {
      setSceneSize(size); setCorners(blankCorners()); setSurfaceId(''); setNextCorner(0);
      setNotice('Cena importada. Marque os quatro cantos da superfície.');
    } else if (slot === 'final') {
      setNotice('Imagem pronta para revisão. Confira arte, grafia, proporções e textura antes de aprovar.');
    }
    return record;
  }
  async function useBuiltin() {
    if (!builtin) return;
    await run('Importando cena incluída…', async session => {
      const response = await fetch(builtin.url);
      if (session.disposed) return;
      if (!response.ok) throw new Error('Não foi possível carregar a cena incluída. Importe uma cena própria para continuar.');
      const bytes = await response.blob();
      if (session.disposed) return;
      const record = await importImage(new File([bytes], builtin.url.split('/').pop()!, { type: 'image/png' }), 'scene', session);
      if (!record || session.disposed) return;
      setSceneSize({ width: builtin.width, height: builtin.height });
      chooseSurface(builtin.surfaces[0].id);
      setSceneProvenance(`Cena fotográfica gerada originalmente para Marquio: ${builtin.id}; procedência em public/mockups/PROVENANCE.md.`);
      setNotice('Cena incluída importada. Selecione a arte completa e revise a aplicação.');
    });
  }
  function markCorner(event: MouseEvent<HTMLButtonElement>) {
    if (!sceneSize || !photoRef.current || event.detail === 0) return;
    const rect = photoRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const point = { x: String(Math.round((event.clientX - rect.left) / rect.width * sceneSize.width)), y: String(Math.round((event.clientY - rect.top) / rect.height * sceneSize.height)) };
    setCorners(previous => previous.map((old, index) => index === nextCorner ? point : old));
    setNextCorner((nextCorner + 1) % 4); setSurfaceId('');
  }
  async function generate() {
    await run('Gerando imagem…', async session => {
      const result = await generateMockup(createMockupRequest(prepared), provider);
      if (session.disposed) return;
      const record = await importImage(new File([result.image], `${presetId}-${result.kind}.${imageExtension(result.image.type)}`, { type: result.image.type }), result.kind === 'scene' ? 'scene' : 'final', session);
      if (!record || session.disposed) return;
      if (result.kind === 'finished-image') setGeneration(result);
      const provenance = JSON.stringify({ ...result.provenance, model: result.model });
      if (result.kind === 'scene') setSceneProvenance(provenance); else setFinalProvenance(provenance);
    });
  }
  function approve(node: MockupNode, provenance = '') {
    try {
      const approved = { ...node, approval: { status: 'approved' as const, at: new Date().toISOString() },
        origin: provenance ? { kind: 'suggested' as const, description: provenance } : node.origin };
      onInsert(approved); setNotice('Aplicação aprovada e inserida na página.'); setError('');
    } catch (cause) { setError(message(cause)); }
  }
  function downloadRequest() {
    try {
      const request = createMockupRequest(prepared);
      const url = URL.createObjectURL(new Blob([JSON.stringify(request, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `${presetId}-pedido.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Pedido baixado com prompt e referências dos arquivos selecionados.');
    } catch (cause) { setError(message(cause)); }
  }
  function assetSelect(label: string, slot: AssetSlot, onChange?: (id: string) => void) {
    return <label className="mockups-field"><span>{label}</span><select value={selected[slot] ?? ''} disabled={Boolean(busy)} onChange={event => onChange ? onChange(event.target.value) : setSelected(previous => ({ ...previous, [slot]: event.target.value || undefined }))}>
      <option value="">Selecionar arquivo</option>{images.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>;
  }
  function upload(label: string, slot: AssetSlot) {
    return <label className="mockups-upload"><span>{label}</span><input type="file" accept="image/*" disabled={Boolean(busy)} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (file) void run(`Importando ${label.toLowerCase()}…`, async session => { const record = await importImage(file, slot, session); if (!record || session.disposed) return; if (slot === 'final') setGeneration(undefined); if (slot === 'scene') setSceneProvenance(''); if (slot === 'final') setFinalProvenance(''); });
    }} /></label>;
  }

  return <section className="mockups-panel" aria-label="Mockups" aria-busy={Boolean(busy)}>
    <h2>Mockups</h2>
    <label className="mockups-field"><span>Cena</span><select value={presetId} disabled={Boolean(busy)} onChange={event => choosePreset(event.target.value)}>{MOCKUP_PRESETS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <p className="mockups-muted">{preset.guidance}</p>
    {preset.application === 'finished-image' && <p className="mockups-muted">Imagem final substituível, sem aplicação planar de tecido ou bordado.</p>}
    <fieldset disabled={Boolean(busy)}>
      <legend>Arquivos da aplicação</legend>
      {builtin && !selected.scene && <figure className="mockups-builtin"><img src={builtin.url} alt={builtin.name} /><figcaption>Fotografia-base original do projeto</figcaption><button type="button" onClick={() => void useBuiltin()}>Usar cena incluída</button></figure>}
      {assetSelect('Cena base', 'scene', chooseScene)}
      {upload('Importar cena', 'scene')}
      {assetSelect('Arte completa da aplicação', 'artwork')}
      {upload('Importar arte', 'artwork')}
      <p className="mockups-muted">Prepare a arte completa nas proporções da superfície. Para um logo isolado, componha a aplicação primeiro; a projeção não ajusta suas proporções.</p>
      {assetSelect('Logo para o prompt (opcional conforme a cena)', 'logo')}
      {upload('Importar logo', 'logo')}
      {presetId === 'portrait-badge' && <>{assetSelect('Retrato autorizado (opcional)', 'portrait')}{upload('Importar retrato autorizado', 'portrait')}</>}
    </fieldset>

    {preset.application === 'planar' && selected.scene && <fieldset disabled={Boolean(busy)}>
      <legend>Superfície e perspectiva</legend>
      {!sceneSize && <p role="alert">Este asset não tem dimensões. Importe o arquivo da cena para marcar os cantos.</p>}
      {builtin && sceneProvenance.includes(builtin.id) && <label className="mockups-field"><span>Superfície incluída</span><select value={surfaceId} onChange={event => chooseSurface(event.target.value)}><option value="">Cantos manuais</option>{builtin.surfaces.map(surface => <option key={surface.id} value={surface.id}>{surface.name}</option>)}</select></label>}
      {src(selected.scene) && <>
        <p id={`${scope}-corners`} className="mockups-muted">Clique na cena para marcar: {CORNER_NAMES[nextCorner].toLowerCase()}. Também é possível editar X e Y abaixo, em pixels da imagem.</p>
        <button type="button" className="mockups-corner-canvas" aria-label="Marcar próximo canto na cena" aria-describedby={`${scope}-corners`} onClick={markCorner}>
          <img ref={photoRef} src={src(selected.scene)} alt="Cena para marcação dos quatro cantos" />
          {sceneSize && <svg viewBox={`0 0 ${sceneSize.width} ${sceneSize.height}`} aria-hidden="true">{corners.map((point, index) => point.x !== '' && point.y !== '' ? <g key={index}><circle cx={Number(point.x)} cy={Number(point.y)} r={sceneSize.width / 60} /><text x={Number(point.x)} y={Number(point.y)} dy=".35em" textAnchor="middle" fontSize={sceneSize.width / 45}>{index + 1}</text></g> : null)}</svg>}
        </button>
      </>}
      {CORNER_NAMES.map((name, index) => <div className="mockups-corner-row" key={name}><span>{name}</span>{(['x', 'y'] as const).map(axis => <label key={axis}><span>{axis.toUpperCase()}</span><input type="number" min={0} max={axis === 'x' ? sceneSize?.width : sceneSize?.height} aria-label={`${name} ${axis.toUpperCase()}`} value={corners[index][axis]} onChange={event => { setCorners(previous => previous.map((point, i) => i === index ? { ...point, [axis]: event.target.value } : point)); setSurfaceId(''); }} /></label>)}</div>)}
      <details><summary>Máscara e luz (opcional)</summary>{assetSelect('Máscara alpha: transparente oculta a arte', 'mask')}{upload('Importar máscara', 'mask')}{assetSelect('Overlay de luz/moldura', 'overlay')}{upload('Importar overlay', 'overlay')}</details>
      {placementError && <p role="alert">{placementError}</p>}
      {candidate && <><p className="mockups-muted">Prévia da aplicação. Confira proporções e oclusões.</p><ApplicationPreview node={candidate} assets={assets} resolveAsset={record => src(record.id) ?? `/${record.path}`} /></>}
      <button className="mockups-primary" type="button" disabled={!candidate} onClick={() => candidate && approve(candidate, sceneProvenance)}>Aprovar e inserir aplicação</button>
    </fieldset>}

    <fieldset disabled={Boolean(busy)}>
      <legend>Prompt e geração opcional</legend>
      <label className="mockups-field"><span>Objetivo do prompt</span><select value={mode} onChange={event => setMode(event.target.value as 'scene' | 'application')}><option value="application">Aplicar arte na cena selecionada</option><option value="scene">Criar cena vazia</option></select></label>
      <label className="mockups-field"><span>Proporção da imagem</span><input value={aspectRatio} onChange={event => setAspectRatio(event.target.value)} /></label>
      <details><summary>Ajustar direção da cena</summary><label className="mockups-field"><span>Material (opcional)</span><input value={material} placeholder={preset.material} onChange={event => setMaterial(event.target.value)} /></label><label className="mockups-field"><span>Variação da cena (opcional)</span><textarea value={sceneVariant} onChange={event => setSceneVariant(event.target.value)} /></label></details>
      {prepared.status === 'ready' ? <><p className="mockups-muted">Prompt preparado. Nenhuma imagem foi gerada por esta preparação.</p><label className="mockups-field"><span>Prompt resolvido</span><textarea className="mockups-prompt" readOnly value={prepared.prompt} /></label></> : <ul className="mockups-requirements">{prepared.missingInputs.map(item => <li key={item.id}>{item.label}</li>)}</ul>}
      <div className="mockups-actions"><button type="button" disabled={prepared.status !== 'ready'} onClick={() => void run('Copiando prompt…', async session => {
        if (onCopy) await onCopy(prepared.prompt!); else { if (!navigator.clipboard) throw new Error('Cópia indisponível neste navegador. Baixe o pedido ou selecione o texto do prompt.'); await navigator.clipboard.writeText(prepared.prompt!); }
        if (!session.disposed) setNotice('Prompt copiado.');
      })}>Copiar prompt</button><button type="button" disabled={prepared.status !== 'ready'} onClick={downloadRequest}>Baixar pedido</button></div>
      <p className="mockups-muted">{provider ? `Provedor configurado: ${provider.name}` : 'Nenhum provedor configurado. Copie o prompt e importe o resultado para continuar.'}</p>
      <button type="button" disabled={!provider || prepared.status !== 'ready'} onClick={() => void generate()}>Gerar imagem</button>
    </fieldset>

    <fieldset disabled={Boolean(busy)}>
      <legend>Imagem final e revisão</legend>
      {upload('Importar imagem final', 'final')}
      {imageReady && <><p>Imagem pronta para revisão.</p>{src(finalAsset!.id) && <img className="mockups-result" src={src(finalAsset!.id)} alt="Imagem final aguardando aprovação" />}{generation && <p className="mockups-muted">{generation.provenance.providerId} / {generation.model} — {generation.provenance.generatedAt}</p>}<button className="mockups-primary" type="button" onClick={() => {
        const width = 960; const height = width * (finalAsset!.height ?? 540) / (finalAsset!.width ?? 960);
        approve(createFinalImageMockup({ presetId, assetId: finalAsset!.id, width, height, prompt: generation?.kind === 'finished-image' ? generation.provenance.prompt : undefined }), finalProvenance);
      }}>Aprovar e inserir imagem final</button></>}
    </fieldset>
    <div className="mockups-status" role="status" aria-live="polite">{busy || notice}</div>
    {error && <p className="mockups-error" role="alert">{error}</p>}
  </section>;
}

function imageExtension(mimeType: string): string { return ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' } as Record<string, string>)[mimeType] ?? 'img'; }
function message(cause: unknown): string { return cause instanceof Error ? cause.message : 'A operação falhou. Tente novamente ou importe uma imagem.'; }
function allocateLifetimeUrl(file: Blob, session: PanelLifetime): string | undefined {
  if (session.disposed) return;
  const url = URL.createObjectURL(file);
  if (session.disposed) { URL.revokeObjectURL(url); return; }
  session.urls.add(url);
  return url;
}
async function imageDimensions(file: File, session: PanelLifetime): Promise<{ width: number; height: number } | undefined> {
  const url = allocateLifetimeUrl(file, session);
  if (!url) return;
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0
        ? resolve({ width: image.naturalWidth, height: image.naturalHeight }) : reject(new Error('A imagem não tem dimensões válidas.'));
      image.onerror = () => reject(new Error('Não foi possível abrir esta imagem. Envie PNG, JPEG, WebP ou SVG válido.')); image.src = url;
    });
  } finally { session.urls.delete(url); URL.revokeObjectURL(url); }
}
function ApplicationPreview({ node, assets, resolveAsset }: { node: MockupNode; assets: AssetRecord[]; resolveAsset: (record: AssetRecord) => string }) {
  return <svg className="mockups-application-preview" viewBox={`0 0 ${node.transform.width} ${node.transform.height}`} role="img" aria-label="Prévia da arte aplicada à cena">
    <foreignObject width={node.transform.width} height={node.transform.height}>
      <div style={{ position: 'relative', width: node.transform.width, height: node.transform.height, overflow: 'hidden' }}><NodeRenderer node={node} assets={assets} resolveAsset={resolveAsset} /></div>
    </foreignObject>
  </svg>;
}
