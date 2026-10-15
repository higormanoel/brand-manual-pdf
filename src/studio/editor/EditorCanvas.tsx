import { useRef, useState, type PointerEvent } from "react";
import type { BrandProject, Page } from "../../core/project";
import {
  applyCommands,
  findNode,
  type DocumentCommand,
  type NodeLocation,
} from "../../core/commands";
import {
  documentDeltaToLocal,
  transformPoint,
  transformMatrix,
} from "../../core/geometry";
import type { AssetResolver } from "../../render/NodeRenderer";
import { Artboard } from "../../render/Artboard";
import {
  SelectionOverlay,
  selectionStyle,
  type Handle,
} from "./SelectionOverlay";
import type { Tool } from "./Toolbar";
interface Props {
  project: BrandProject;
  page: Page;
  selected: string[];
  zoom: number;
  tool: Tool;
  space: boolean;
  grid: boolean;
  guides: boolean;
  snap: boolean;
  resolveAsset: AssetResolver;
  onSelect: (ids: string[]) => void;
  onCommands: (commands: DocumentCommand[]) => void;
  onFit: () => void;
  viewportRef?: (node: HTMLDivElement | null) => void;
}
interface Gesture {
  x: number;
  y: number;
  ids: string[];
  collapseTo?: string;
  resize?: {
    location: NodeLocation;
    handle: Handle;
  };
  pan?: {
    left: number;
    top: number;
  };
}
export function EditorCanvas({
  project,
  page,
  selected,
  zoom,
  tool,
  space,
  grid,
  guides,
  snap,
  resolveAsset,
  onSelect,
  onCommands,
  onFit,
  viewportRef,
}: Props) {
  const viewport = useRef<HTMLDivElement>(null),
    gesture = useRef<Gesture | null>(null),
    commands = useRef<DocumentCommand[]>([]);
  const [preview, setPreview] = useState<DocumentCommand[]>([]);
  const shown = preview.length ? applyCommands(project, preview) : project;
  const shownPage = shown.pages.find((p) => p.id === page.id)!;
  const locations = selected.flatMap((id) => {
    const found = findNode(shown, page.id, id);
    return found ? [found] : [];
  });
  function begin(
    event: PointerEvent,
    ids: string[],
    resize?: Gesture["resize"],
    collapseTo?: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      ids,
      resize,
      collapseTo,
    };
    commands.current = [];
  }
  function move(event: PointerEvent) {
    const state = gesture.current;
    if (!state) return;
    if (state.pan) {
      if (viewport.current) {
        viewport.current.scrollLeft =
          state.pan.left - (event.clientX - state.x);
        viewport.current.scrollTop = state.pan.top - (event.clientY - state.y);
      }
      return;
    }
    const raw = {
      x: (event.clientX - state.x) / zoom,
      y: (event.clientY - state.y) / zoom,
    };
    if (!state.resize && Math.hypot(raw.x, raw.y) < 1) return;
    const delta = snap
      ? { x: Math.round(raw.x / 10) * 10, y: Math.round(raw.y / 10) * 10 }
      : raw;
    let next: DocumentCommand[];
    if (state.resize) {
      const { location, handle } = state.resize;
      const t = location.node.transform;
      const local = documentDeltaToLocal(delta, [
        ...location.ancestors.map((n) => n.transform),
        t,
      ]);
      const west = handle.includes("w"),
        north = handle.includes("n");
      const width = Math.max(1, t.width + (west ? -local.x : local.x)),
        height = Math.max(1, t.height + (north ? -local.y : local.y));
      const shift = transformPoint(
        { x: west ? t.width - width : 0, y: north ? t.height - height : 0 },
        transformMatrix({ ...t, x: 0, y: 0 }),
      );
      next = [
        {
          type: "node.update",
          pageId: page.id,
          nodeId: location.node.id,
          patch: {
            transform: { width, height, x: t.x + shift.x, y: t.y + shift.y },
          },
        },
      ];
    } else
      next = [
        {
          type: "node.move",
          pageId: page.id,
          nodeIds: state.ids,
          delta,
          source: "gesture",
        },
      ];
    commands.current = next;
    setPreview(next);
  }
  function end() {
    if (!gesture.current) return;
    const collapseTo = gesture.current.collapseTo;
    gesture.current = null;
    const next = commands.current;
    commands.current = [];
    setPreview([]);
    if (next.length) onCommands(next);
    else if (collapseTo) onSelect([collapseTo]);
  }
  function pan(event: PointerEvent) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      ids: [],
      pan: {
        left: viewport.current?.scrollLeft ?? 0,
        top: viewport.current?.scrollTop ?? 0,
      },
    };
  }
  return (
    <section className="canvas-region" aria-label="Área da prancheta">
      <div className="canvas-page-label">
        <span>{page.title}</span>
        <span>
          {page.width} × {page.height}
        </span>
      </div>
      <div
        className={`canvas-viewport ${tool === "hand" || space ? "is-panning" : ""}`}
        ref={(node) => {
          viewport.current = node;
          viewportRef?.(node);
        }}
        onPointerDown={(event) => {
          if (tool === "hand" || space || event.button === 1) pan(event);
          else if (event.target === event.currentTarget) onSelect([]);
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          gesture.current = null;
          commands.current = [];
          setPreview([]);
        }}
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) onFit();
        }}
      >
        <div className="canvas-padding">
          <div
            className="canvas-size"
            style={{ width: page.width * zoom, height: page.height * zoom }}
          >
            <div
              className="canvas-zoom"
              style={{
                width: page.width,
                height: page.height,
                transform: `scale(${zoom})`,
              }}
            >
              <Artboard
                page={shownPage}
                assets={project.assets}
                resolveAsset={resolveAsset}
                mode="editor"
              />
              {grid && (
                <div
                  className="canvas-grid"
                  style={{ backgroundSize: "20px 20px" }}
                />
              )}
              {guides && (
                <div className="canvas-guides" style={{ inset: 91 }} />
              )}
              <div
                className="node-hits"
                onPointerDown={(event) => {
                  if (tool === "hand" || space) pan(event);
                  else if (event.target === event.currentTarget) onSelect([]);
                }}
              >
                {shownPage.nodes
                  .filter((node) => node.visible)
                  .map((node) => (
                    <button
                      key={node.id}
                      className="node-hit"
                      data-hit-id={node.id}
                      aria-label={`Selecionar ${node.name}`}
                      aria-pressed={selected.includes(node.id)}
                      style={selectionStyle(node)}
                      onPointerDown={(event) => {
                        if (tool === "hand" || space) {
                          pan(event);
                          return;
                        }
                        const ids = event.shiftKey
                          ? selected.includes(node.id)
                            ? selected.filter((id) => id !== node.id)
                            : [...selected, node.id]
                          : selected.includes(node.id)
                            ? selected
                            : [node.id];
                        onSelect(ids);
                        if (!node.locked && ids.includes(node.id))
                          begin(
                            event,
                            ids,
                            undefined,
                            !event.shiftKey && ids.length > 1
                              ? node.id
                              : undefined,
                          );
                        else event.stopPropagation();
                      }}
                    />
                  ))}
              </div>
              <SelectionOverlay
                locations={locations}
                zoom={zoom}
                onResize={(event, location, handle) =>
                  begin(event, [location.node.id], { location, handle })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
