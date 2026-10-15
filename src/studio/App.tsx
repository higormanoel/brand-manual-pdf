import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BrandProject,
  AssetRecord,
  DocumentNode,
  Page,
  Diagnostic,
} from "../core/project";
import { createHistory } from "../core/history";
import {
  findNode,
  type DocumentCommand,
  type CommandBatch,
} from "../core/commands";
import {
  alignmentDeltas,
  distributionDeltas,
  type Alignment,
} from "../core/geometry";
import { generateManual, type GenerationResult } from "../editorial/generate";
import { measureText } from "../render/textMeasurement";
import { Artboard } from "../render/Artboard";
import { loadProjectFonts } from "../render/fonts";
import { SaveQueue } from "./editor/saveQueue";
import type { StudioRuntime } from "./runtime-contract";
import { EditorCanvas } from "./editor/EditorCanvas";
import { Toolbar, IconButton, type Tool } from "./editor/Toolbar";
import { PagesPanel } from "./panels/PagesPanel";
import { LayersPanel } from "./panels/LayersPanel";
import { PropertiesPanel } from "./panels/PropertiesPanel";
import { AssetsPanel } from "./panels/AssetsPanel";
import { MockupsPanel } from "./panels/MockupsPanel";
import { Intake } from "./intake/Intake";
import "./styles/studio.css";
export interface AppProps {
  runtime: StudioRuntime;
  onNewProject?: () => void;
  onOpenPortable?: (file: File) => Promise<void>;
}
const id = () => crypto.randomUUID();
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function allIds(node: DocumentNode): string[] {
  return [
    node.id,
    ...(node.type === "group" || node.type === "mockup"
      ? node.children.flatMap(allIds)
      : []),
  ];
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const baseNode = (name: string) => ({
  id: id(),
  name,
  transform: {
    x: 200,
    y: 200,
    width: 640,
    height: 180,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  },
  opacity: 1,
  visible: true,
  locked: false,
  origin: { kind: "manual" as const },
  approval: { status: "pending" as const },
  manuallyEdited: true,
});
const defaultStyle = {
  fontFamily: "Inter",
  fontSize: 48,
  fontWeight: 400,
  fontStyle: "normal" as const,
  lineHeight: 1.2,
  letterSpacing: 0,
  color: "#0f0f0f",
  align: "left" as const,
  verticalAlign: "top" as const,
};
export function App({ runtime, onNewProject, onOpenPortable }: AppProps) {
  const [initialHistory] = useState(() => createHistory(runtime.project));
  const history = useRef(initialHistory),
    knownAssets = useRef(new Map(runtime.project.assets.map((a) => [a.id, a])));
  const [project, setProject] = useState(runtime.project),
    [pageId, setPageId] = useState(runtime.project.pages[0]?.id),
    [selected, setSelected] = useState<string[]>([]),
    [tick, setTick] = useState(0);
  const [tool, setTool] = useState<Tool>("select"),
    [zoom, setZoom] = useState(0.5),
    [space, setSpace] = useState(false),
    [grid, setGrid] = useState(false),
    [guides, setGuides] = useState(true),
    [snap, setSnap] = useState(false);
  const [panel, setPanel] = useState("properties"),
    [mobilePanel, setMobilePanel] = useState("preview"),
    [intake, setIntake] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [checkpointError, setCheckpointError] = useState("");
  const [proposal, setProposal] = useState<{
      result: GenerationResult;
      expectedPages: Page[];
    } | null>(null),
    [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]),
    [pdf, setPdf] = useState<{
      url: string;
      revision: number;
      pages: number;
    } | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null),
    alive = useRef(true),
    projectRef = useRef(project),
    checkpointTail = useRef(Promise.resolve());
  projectRef.current = project;
  const queue = useRef<SaveQueue | null>(null);
  if (!queue.current)
    queue.current = new SaveQueue(
      runtime.project.revision,
      (batch) => runtime.commit(batch),
      () => {
        if (alive.current) setTick((t) => t + 1);
      },
    );
  const saves = queue.current;
  const page = project.pages.find((p) => p.id === pageId) ?? project.pages[0];
  const manifest = useMemo(
    () => new Map(project.assets.map((a) => [a.id, a])),
    [project.assets],
  );
  const resolveId = useCallback(
    (assetId: string) => {
      const asset = manifest.get(assetId);
      return asset ? runtime.resolveAsset(asset) : undefined;
    },
    [manifest, runtime],
  );
  function withAssets(snapshot: BrandProject): BrandProject {
    return { ...snapshot, assets: [...knownAssets.current.values()] };
  }
  function view(snapshot: BrandProject) {
    setProject(withAssets(snapshot));
  }
  function commands(next: DocumentCommand[]) {
    if (!next.length) return;
    try {
      const before = history.current.current;
      const missing = [...knownAssets.current.values()].filter(
        (a) =>
          !history.current.current.assets.some(
            (existing) => existing.id === a.id,
          ),
      );
      const nextProject = history.current.execute([
        ...missing.map((asset) => ({ type: "asset.insert" as const, asset })),
        ...next,
      ]);
      if (nextProject === before) return;
      for (const asset of nextProject.assets)
        knownAssets.current.set(asset.id, asset);
      view(nextProject);
      saves.enqueue(next);
      setError("");
    } catch (error) {
      setError(message(error));
    }
  }
  function travel(direction: "undo" | "redo") {
    try {
      if (
        direction === "undo"
          ? !history.current.canUndo
          : !history.current.canRedo
      )
        return;
      const snapshot = withAssets(history.current[direction]());
      setProject(snapshot);
      saves.enqueue([{ type: "project.restore", project: snapshot }]);
      setSelected([]);
    } catch (error) {
      setError(message(error));
    }
  }
  function selectPage(next: string) {
    setPageId(next);
    setSelected([]);
    setMobilePanel("preview");
  }
  function insert(node: DocumentNode) {
    if (!page) {
      setError("Adicione uma página antes de inserir objetos.");
      return;
    }
    commands([{ type: "node.insert", pageId: page.id, node }]);
    setSelected([node.id]);
    setPanel("properties");
  }
  function insertText() {
    insert({
      ...baseNode("Texto"),
      type: "text",
      text: "Seu texto aqui",
      style: {
        ...defaultStyle,
        color: page?.background === "#040606" ? "#ffffff" : "#0f0f0f",
      },
    });
  }
  function insertShape() {
    insert({
      ...baseNode("Retângulo"),
      type: "shape",
      transform: { ...baseNode("").transform, width: 320, height: 240 },
      shape: "rectangle",
      style: {
        fill: "#b5b5b5",
        stroke: "none",
        strokeWidth: 0,
        cornerRadius: 0,
      },
    });
  }
  function insertImage(asset: AssetRecord) {
    insert({
      ...baseNode(asset.name),
      type: "image",
      transform: { ...baseNode("").transform, width: 640, height: 420 },
      assetId: asset.id,
      fit: "contain",
      alt: asset.name,
    });
  }
  function addPage() {
    const next: Page = {
      id: id(),
      sectionId: project.sections[0].id,
      title: "Nova página",
      width: 1920,
      height: 1080,
      background: "#ffffff",
      nodes: [],
    };
    commands([{ type: "page.insert", page: next }]);
    selectPage(next.id);
  }
  function duplicatePage() {
    if (!page) return;
    const map = Object.fromEntries(
      [page.id, ...page.nodes.flatMap(allIds)].map((old) => [old, id()]),
    );
    commands([{ type: "page.duplicate", pageId: page.id, idMap: map }]);
    selectPage(map[page.id]);
  }
  function remove() {
    if (!page) return;
    const roots = selected.filter(
      (nodeId) =>
        !findNode(project, page.id, nodeId)?.ancestors.some((a) =>
          selected.includes(a.id),
        ),
    );
    commands(
      roots.map((nodeId) => ({ type: "node.delete", pageId: page.id, nodeId })),
    );
    setSelected([]);
  }
  function duplicate() {
    if (!page) return;
    const ids: string[] = [];
    const next = selected
      .filter(
        (nodeId) =>
          !findNode(project, page.id, nodeId)?.ancestors.some((a) =>
            selected.includes(a.id),
          ),
      )
      .flatMap((nodeId) => {
        const location = findNode(project, page.id, nodeId);
        if (!location) return [];
        const map = Object.fromEntries(
          allIds(location.node).map((old) => [old, id()]),
        );
        ids.push(map[nodeId]);
        return [
          {
            type: "node.duplicate" as const,
            pageId: page.id,
            nodeId,
            idMap: map,
            offset: { x: 24, y: 24 },
          },
        ];
      });
    commands(next);
    setSelected(ids);
  }
  function group() {
    if (!page) return;
    const groupId = id();
    const before = history.current.current;
    commands([
      { type: "node.group", pageId: page.id, nodeIds: selected, groupId },
    ]);
    if (history.current.current !== before) setSelected([groupId]);
  }
  function ungroup() {
    if (!page || selected.length !== 1) return;
    const node = findNode(project, page.id, selected[0])?.node;
    const before = history.current.current;
    commands([{ type: "node.ungroup", pageId: page.id, nodeId: selected[0] }]);
    if (history.current.current !== before)
      setSelected(node?.type === "group" ? node.children.map((c) => c.id) : []);
  }
  function reorder(direction: number) {
    if (!page) return;
    const selectedSet = new Set(selected);
    const locations = selected.flatMap((nodeId) => {
      const l = findNode(project, page.id, nodeId);
      return l && !l.ancestors.some((a) => selectedSet.has(a.id)) ? [l] : [];
    });
    const siblings = new Set(locations.map((l) => l.siblings));
    const next: DocumentCommand[] = [];
    for (const list of siblings) {
      const desired = [...list];
      if (direction > 0) {
        for (let i = desired.length - 2; i >= 0; i--) {
          if (
            selectedSet.has(desired[i].id) &&
            !selectedSet.has(desired[i + 1].id)
          )
            [desired[i], desired[i + 1]] = [desired[i + 1], desired[i]];
        }
      } else {
        for (let i = 1; i < desired.length; i++) {
          if (
            selectedSet.has(desired[i].id) &&
            !selectedSet.has(desired[i - 1].id)
          )
            [desired[i], desired[i - 1]] = [desired[i - 1], desired[i]];
        }
      }
      const changed = locations
        .filter(
          (l) =>
            l.siblings === list &&
            desired.findIndex((n) => n.id === l.node.id) !== l.index,
        )
        .sort((a, b) =>
          direction > 0 ? b.index - a.index : a.index - b.index,
        );
      next.push(
        ...changed.map((l) => ({
          type: "node.reorder" as const,
          pageId: page.id,
          nodeId: l.node.id,
          index: desired.findIndex((n) => n.id === l.node.id),
        })),
      );
    }
    commands(next);
  }
  function align(value: Alignment | "horizontal" | "vertical") {
    if (!page) return;
    const items = selected.flatMap((nodeId) => {
      const l = findNode(project, page.id, nodeId);
      return l && !l.ancestors.some((a) => selected.includes(a.id))
        ? [
            {
              id: nodeId,
              transform: l.node.transform,
              ancestors: l.ancestors.map((a) => a.transform),
            },
          ]
        : [];
    });
    const deltas =
      value === "horizontal" || value === "vertical"
        ? distributionDeltas(items, value)
        : alignmentDeltas(
            items,
            value,
            items.length === 1
              ? { x: 0, y: 0, width: page.width, height: page.height }
              : undefined,
          );
    commands(
      deltas.map((d) => ({
        type: "node.move",
        pageId: page.id,
        nodeIds: [d.id],
        delta: d.delta,
        source: "keyboard",
      })),
    );
  }
  function fit() {
    if (!page || !viewport.current) return;
    const { clientWidth, clientHeight } = viewport.current;
    setZoom(
      Math.max(
        0.1,
        Math.min(
          1,
          (clientWidth - 80) / page.width,
          (clientHeight - 80) / page.height,
        ),
      ),
    );
    viewport.current.scrollTo(0, 0);
  }
  async function importAsset(file: File): Promise<AssetRecord> {
    setBusy(`Importando ${file.name}…`);
    try {
      const input = {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: new Uint8Array(await file.arrayBuffer()),
        origin: { kind: "provided" as const },
      };
      return await saves.barrier(async (revision) => {
        const commandId = id();
        const result = await runtime.importAsset(input, {
          commandId,
          expectedRevision: revision,
        });
        if (
          result.ack.commandId !== commandId ||
          result.ack.project.id !== projectRef.current.id ||
          result.ack.project.revision !== result.ack.revision ||
          result.ack.revision <= revision
        )
          throw new Error("Importação sem confirmação de revisão.");
        knownAssets.current.set(result.asset.id, result.asset);
        view(history.current.current);
        return { result: result.asset, revision: result.ack.revision };
      });
    } catch (error) {
      setError(`Não foi possível importar ${file.name}. ${message(error)}`);
      throw error;
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    setBusy("Gerando manual…");
    try {
      await saves.flush();
      const snapshot = { ...projectRef.current, revision: saves.revision };
      const fonts = await loadProjectFonts(snapshot, runtime.resolveAsset);
      const result = await generateManual(snapshot, {
        measureText,
        variantId: id(),
      });
      setDiagnostics([
        ...result.diagnostics,
        ...fonts
          .filter((f) => f.status === "substituted")
          .map((f) => ({
            code: "font-substitution" as const,
            severity: "warning" as const,
            path: "sections",
            message: f.message ?? `Fonte ${f.family} substituída.`,
          })),
      ]);
      if (snapshot.pages.length)
        setProposal({ result, expectedPages: structuredClone(snapshot.pages) });
      else {
        const pages = result.sections.flatMap((s) => s.pages);
        if (pages.length) {
          commands([{ type: "variant.install", mode: "append", pages }]);
          selectPage(pages[0].id);
        }
      }
      setIntake(false);
    } finally {
      setBusy("");
    }
  }
  function install(mode: "append" | "replace") {
    if (!proposal) return;
    const pages = proposal.result.sections.flatMap((s) => s.pages);
    if (!pages.length) {
      setError("A proposta não contém páginas.");
      return;
    }
    const before = history.current.current;
    commands([
      mode === "append"
        ? { type: "variant.install", mode, pages }
        : {
            type: "variant.install",
            mode,
            pages,
            expectedPages: proposal.expectedPages,
          },
    ]);
    if (history.current.current !== before) {
      setProposal(null);
      selectPage(pages[0].id);
    }
  }
  async function exportDocument(kind: "portable" | "pdf" | "print") {
    setBusy(kind === "pdf" ? "Exportando PDF…" : "Preparando arquivo…");
    try {
      await saves.barrier(
        async (revision) => {
          if (kind === "portable") {
            const bytes = await runtime.exportPortable(revision);
            download(
              new Blob([new Uint8Array(bytes).buffer], {
                type: "application/zip",
              }),
              `${project.title}.marquio.zip`,
            );
          } else if (kind === "pdf") {
            if (!runtime.exportPdf)
              throw new Error("Exportação PDF local indisponível.");
            const result = await runtime.exportPdf(revision);
            if (result.revision !== revision)
              throw new Error("A exportação retornou outra revisão.");
            setPdf({
              url: URL.createObjectURL(result.blob),
              revision: result.revision,
              pages: result.pages,
            });
          } else window.print();
          return { result: undefined };
        },
        { haltOnError: false },
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy("");
    }
  }
  async function backupRecovery() {
    try {
      if (runtime.exportRecovery) {
        const bytes = await runtime.exportRecovery(projectRef.current);
        download(
          new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }),
          "recuperacao-nao-confirmada.zip",
        );
      } else {
        const recovery = {
          project: projectRef.current,
          pending: saves.pending,
          confirmedRevision: saves.revision,
        };
        download(
          new Blob([JSON.stringify(recovery, null, 2)], {
            type: "application/json",
          }),
          "marquio-manifesto-recuperacao-sem-arquivos.json",
        );
      }
    } catch (error) {
      setError(`Falha no backup de recuperação. ${message(error)}`);
    }
  }

  async function reload() {
    if (!runtime.reload) return;
    setBusy("Recarregando…");
    try {
      const recovered = await runtime.reload();
      if (recovered.id !== project.id)
        throw new Error("O projeto recarregado tem outro identificador.");
      history.current = createHistory(recovered);
      knownAssets.current = new Map(recovered.assets.map((a) => [a.id, a]));
      queue.current = new SaveQueue(
        recovered.revision,
        (batch) => runtime.commit(batch),
        () => {
          if (alive.current) setTick((t) => t + 1);
        },
      );
      setProject(recovered);
      setSelected([]);
      setError("");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!runtime.checkpoint) return;
    const input = {
      project,
      pending: saves.pending,
      confirmedRevision: saves.revision,
    };
    checkpointTail.current = checkpointTail.current
      .catch(() => {})
      .then(() => runtime.checkpoint!(input))
      .then(() => {
        if (alive.current) setCheckpointError("");
      })
      .catch((error) => {
        if (alive.current)
          setCheckpointError(
            `A cópia de recuperação falhou. ${message(error)}`,
          );
      });
  }, [project, tick, runtime, saves]);
  const fontSignature = JSON.stringify({
    typography: project.brand.typography,
    assets: project.assets.filter((a) =>
      project.brand.typography.some((t) => t.assetId === a.id),
    ),
  });
  useEffect(() => {
    let disposed = false;
    void loadProjectFonts(projectRef.current, runtime.resolveAsset).then(
      (results) => {
        if (!disposed) {
          const warnings = results.filter((r) => r.status === "substituted");
          if (warnings.length)
            setDiagnostics(
              warnings.map((r) => ({
                code: "font-substitution",
                severity: "warning",
                path: "sections",
                message: r.message ?? r.family,
              })),
            );
        }
      },
    );
    return () => {
      disposed = true;
    };
  }, [fontSignature, runtime]);
  useEffect(() => {
    return () => {
      if (pdf) URL.revokeObjectURL(pdf.url);
    };
  }, [pdf]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select") || target.isContentEditable)
        return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        travel(event.shiftKey ? "redo" : "undo");
      } else if (mod && key === "d") {
        event.preventDefault();
        duplicate();
      } else if (mod && key === "g") {
        event.preventDefault();
        if (event.shiftKey) ungroup();
        else group();
      } else if (mod && key === "a" && page) {
        event.preventDefault();
        setSelected(
          page.nodes.filter((n) => !n.locked && n.visible).map((n) => n.id),
        );
      } else if (event.code === "Space") {
        event.preventDefault();
        setSpace(true);
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        remove();
      } else if (key === "v") setTool("select");
      else if (key === "h") setTool("hand");
      else if (key === "f") fit();
      else if (
        page &&
        selected.length &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        event.preventDefault();
        const amount = event.shiftKey ? 10 : 1;
        commands([
          {
            type: "node.move",
            pageId: page.id,
            nodeIds: selected,
            source: "keyboard",
            delta: {
              x:
                event.key === "ArrowLeft"
                  ? -amount
                  : event.key === "ArrowRight"
                    ? amount
                    : 0,
              y:
                event.key === "ArrowUp"
                  ? -amount
                  : event.key === "ArrowDown"
                    ? amount
                    : 0,
            },
          },
        ]);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpace(false);
    };
    const blur = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  });
  const pending = saves.pending.length;
  const saveFailure = saves.error ? message(saves.error) : "";
  return (
    <div
      className="studio"
      data-mobile-panel={mobilePanel}
      data-confirmed-revision={saves.revision}
    >
      <header className="project-bar">
        <a className="studio-wordmark" href="#" aria-label="Marquio início">
          Marquio<span>STUDIO</span>
        </a>
        <div className="project-title">
          <strong>{project.title}</strong>
          <span className="runtime-mode">
            {runtime.mode === "local"
              ? "Projeto local"
              : "Modo navegador · faça backup portátil"}
          </span>
          <span className="mobile-save-status" role="status">
            {runtime.mode === "local" ? "Local" : "Navegador"} ·{" "}
            {saveFailure
              ? "Conflito"
              : pending
                ? "Salvando…"
                : `Confirmado r${saves.revision}`}
          </span>
        </div>
        <p
          className={`save-status ${saveFailure ? "conflict" : ""}`}
          role="status"
        >
          {saveFailure
            ? "Conflito / falha ao salvar"
            : pending
              ? `${pending} alteração(ões) pendente(s)`
              : `Confirmado · revisão ${saves.revision}`}
        </p>
        <div className="project-actions">
          <button
            onClick={onNewProject}
            disabled={!onNewProject || !!busy || pending > 0}
          >
            Novo
          </button>
          <label className={`file-button ${!onOpenPortable ? "disabled" : ""}`}>
            Abrir
            <input
              aria-label="Abrir projeto portátil"
              type="file"
              accept=".zip"
              disabled={!onOpenPortable || !!busy || pending > 0}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file && onOpenPortable)
                  void onOpenPortable(file).catch((error) =>
                    setError(message(error)),
                  );
              }}
            />
          </label>
          <button onClick={() => setIntake(true)}>Briefing</button>
          <button
            className="primary"
            disabled={!!busy}
            onClick={() =>
              void exportDocument(runtime.exportPdf ? "pdf" : "portable")
            }
          >
            {runtime.exportPdf ? "Exportar PDF" : "Backup portátil"}
          </button>
        </div>
      </header>
      <div className="options-bar">
        <div className="history-actions">
          <IconButton
            icon="undo"
            label="Desfazer"
            disabled={!history.current.canUndo}
            onClick={() => travel("undo")}
          />
          <IconButton
            icon="redo"
            label="Refazer"
            disabled={!history.current.canRedo}
            onClick={() => travel("redo")}
          />
        </div>
        <span className="options-caption">
          {selected.length ? `${selected.length} selecionado(s)` : "Selecionar"}
        </span>
        <label className="align-control">
          <span>Alinhar</span>
          <select
            aria-label="Alinhar objetos"
            value=""
            disabled={!selected.length}
            onChange={(e) => align(e.target.value as Alignment)}
          >
            <option value="" disabled>
              Posição
            </option>
            <option value="left">Esquerda</option>
            <option value="center">Centro horizontal</option>
            <option value="right">Direita</option>
            <option value="top">Topo</option>
            <option value="middle">Centro vertical</option>
            <option value="bottom">Base</option>
            <option value="horizontal">Distribuir horizontal</option>
            <option value="vertical">Distribuir vertical</option>
          </select>
        </label>
        <div className="viewport-options">
          <IconButton
            icon="grid"
            label="Grade"
            active={grid}
            onClick={() => setGrid((v) => !v)}
          />
          <button aria-pressed={guides} onClick={() => setGuides((v) => !v)}>
            Guias
          </button>
          <button aria-pressed={snap} onClick={() => setSnap((v) => !v)}>
            Encaixe
          </button>
          <IconButton icon="fit" label="Ajustar à janela" onClick={fit} />
          <select
            aria-label="Zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[...new Set([0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, zoom])]
              .sort((a, b) => a - b)
              .map((z) => (
                <option value={z} key={z}>
                  {Math.round(z * 100)}%
                </option>
              ))}
          </select>
        </div>
      </div>
      <nav className="mobile-navigation" aria-label="Painel visível">
        {[
          ["preview", "Prancheta"],
          ["pages", "Páginas"],
          ["inspector", "Painel"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={mobilePanel === value}
            onClick={() => setMobilePanel(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {(error || saveFailure || checkpointError) && (
        <div className="studio-error" role="alert">
          <span>
            {error || saveFailure || checkpointError}{" "}
            {saveFailure
              ? "As alterações continuam nesta sessão. Exporte a recuperação antes de recarregar."
              : ""}
          </span>
          <button onClick={() => void backupRecovery()}>
            {runtime.exportRecovery
              ? "Baixar recuperação completa"
              : "Salvar manifesto de recuperação JSON"}
          </button>
          {saveFailure && (
            <button onClick={() => saves.retry()}>
              Tentar salvar novamente
            </button>
          )}
          {saveFailure && runtime.reload && (
            <button onClick={() => void reload()}>
              Recarregar versão confirmada
            </button>
          )}
          <button
            aria-label="Fechar aviso"
            onClick={() => {
              setError("");
              setCheckpointError("");
            }}
          >
            ×
          </button>
        </div>
      )}
      {busy && (
        <div className="studio-busy" role="status">
          {busy}
        </div>
      )}
      <div className="studio-workspace">
        <Toolbar
          tool={tool}
          onTool={setTool}
          onText={insertText}
          onShape={insertShape}
          onImage={() => {
            setPanel("assets");
            setMobilePanel("inspector");
          }}
        />
        <PagesPanel
          project={project}
          activeId={page?.id}
          resolveAsset={runtime.resolveAsset}
          onSelect={selectPage}
          onAdd={addPage}
          onDuplicate={duplicatePage}
          onDelete={() => {
            if (page) {
              commands([{ type: "page.delete", pageId: page.id }]);
              setSelected([]);
            }
          }}
          onReorder={(index) => {
            if (page)
              commands([{ type: "page.reorder", pageId: page.id, index }]);
          }}
        />
        {page ? (
          <EditorCanvas
            project={project}
            page={page}
            selected={selected}
            zoom={zoom}
            tool={tool}
            space={space}
            grid={grid}
            guides={guides}
            snap={snap}
            resolveAsset={runtime.resolveAsset}
            onSelect={(ids) => {
              setSelected(ids);
              if (ids.length) setPanel("properties");
            }}
            onCommands={commands}
            onFit={fit}
            viewportRef={(node) => {
              viewport.current = node;
            }}
          />
        ) : (
          <main className="empty-canvas">
            <h1>O manual começa com a sua marca.</h1>
            <p>
              Preencha o briefing ou crie uma página em branco. Todas as seções
              são opcionais.
            </p>
            <button className="primary" onClick={() => setIntake(true)}>
              Preencher briefing
            </button>
            <button onClick={addPage}>Página em branco</button>
          </main>
        )}
        <aside className="inspector" aria-label="Painel de edição">
          <nav className="inspector-tabs" aria-label="Painéis">
            {[
              ["properties", "Propriedades"],
              ["layers", "Camadas"],
              ["assets", "Assets"],
              ["mockups", "Mockups"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={panel === value}
                onClick={() => setPanel(value)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="inspector-content">
            {panel === "properties" && page && (
              <PropertiesPanel
                project={project}
                page={page}
                selected={selected}
                onCommands={commands}
                onDuplicate={duplicate}
                onDelete={remove}
                onGroup={group}
                onUngroup={ungroup}
                onReorder={reorder}
              />
            )}
            {panel === "layers" && page && (
              <LayersPanel
                page={page}
                selected={selected}
                onSelect={(ids) => {
                  setSelected(ids);
                }}
                onCommands={commands}
              />
            )}
            {panel === "assets" && (
              <AssetsPanel
                project={project}
                resolveAsset={resolveId}
                onImportAsset={importAsset}
                onInsertImage={insertImage}
              />
            )}
            {panel === "mockups" && (
              <MockupsPanel
                project={project}
                resolveAsset={resolveId}
                onImportAsset={importAsset}
                onInsert={insert}
              />
            )}
            {panel === "properties" && (
              <div className="generation-section">
                <h3>Manual editorial</h3>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    void generate().catch((error) => setError(message(error)))
                  }
                >
                  Gerar nova variante
                </button>
                <p className="control-note">
                  Uma nova proposta pode ser adicionada ou substituir as páginas
                  após sua revisão.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
      <footer className="studio-footer">
        <span>
          {project.brand.fictitious ? "Marca fictícia · " : ""}
          {project.pages.length} páginas ·{" "}
          {page ? `Página ${project.pages.indexOf(page) + 1}` : "Sem página"}
        </span>
        <span>
          {runtime.mode === "local"
            ? "Salvo pelo servidor local"
            : "Sessão no navegador"}{" "}
          · revisão confirmada {saves.revision}
        </span>
        <div>
          <button
            disabled={!!busy}
            onClick={() => void exportDocument("portable")}
          >
            Backup portátil
          </button>
          {!runtime.exportPdf && (
            <button
              disabled={!!busy}
              onClick={() => void exportDocument("print")}
            >
              Imprimir pelo navegador
            </button>
          )}
        </div>
      </footer>
      {diagnostics.length > 0 && (
        <details className="diagnostics">
          <summary>{diagnostics.length} aviso(s) de conteúdo/fontes</summary>
          {diagnostics.map((d, i) => (
            <button
              key={i}
              onClick={() => {
                const target = project.pages.find((p) => d.path.includes(p.id));
                if (target) selectPage(target.id);
                else setIntake(true);
              }}
            >
              {d.message}
            </button>
          ))}
        </details>
      )}
      {intake && (
        <div className="studio-modal">
          <Intake
            project={project}
            onCommands={commands}
            onImportAsset={importAsset}
            onGenerate={generate}
            onClose={() => setIntake(false)}
          />
        </div>
      )}
      {proposal && (
        <div className="studio-modal">
          <section
            className="proposal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-title"
          >
            <h2 id="proposal-title">Revisar nova variante</h2>
            <p>
              {proposal.result.sections.reduce(
                (sum, s) => sum + s.pages.length,
                0,
              )}{" "}
              novas páginas. As {proposal.expectedPages.length} páginas
              observadas estão preservadas até sua escolha.
            </p>
            <p>
              A substituição exige que essas páginas permaneçam iguais ao
              momento da geração. O histórico permite desfazer a instalação.
            </p>
            <div className="dialog-actions">
              <button onClick={() => setProposal(null)}>Cancelar</button>
              <button onClick={() => install("replace")}>
                Substituir páginas observadas
              </button>
              <button className="primary" onClick={() => install("append")}>
                Adicionar como nova variante
              </button>
            </div>
          </section>
        </div>
      )}
      {pdf && (
        <div className="studio-modal">
          <section
            className="pdf-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-title"
          >
            <header>
              <h2 id="pdf-title">
                PDF · revisão {pdf.revision} · {pdf.pages} páginas
              </h2>
              <a href={pdf.url} download={`${project.title}.pdf`}>
                Baixar PDF
              </a>
              <button onClick={() => setPdf(null)}>Fechar PDF</button>
            </header>
            <iframe
              title={`Prévia PDF revisão ${pdf.revision}`}
              src={pdf.url}
            />
          </section>
        </div>
      )}
      <div className="studio-print-pages" aria-hidden="true">
        {project.pages.map((p) => (
          <Artboard
            key={p.id}
            page={p}
            assets={project.assets}
            resolveAsset={runtime.resolveAsset}
            mode="print"
          />
        ))}
      </div>
    </div>
  );
}
export type { StudioRuntime, CommandBatch };
