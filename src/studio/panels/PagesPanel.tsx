import type { BrandProject } from "../../core/project";
import type { AssetResolver } from "../../render/NodeRenderer";
import { Artboard } from "../../render/Artboard";
import { IconButton } from "../editor/Toolbar";
export function PagesPanel({
  project,
  activeId,
  resolveAsset,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onReorder,
}: {
  project: BrandProject;
  activeId?: string;
  resolveAsset: AssetResolver;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReorder: (index: number) => void;
}) {
  const index = project.pages.findIndex((p) => p.id === activeId);
  return (
    <aside className="pages-panel" aria-label="Páginas">
      <div className="panel-heading">
        <h2>
          Páginas <small>{project.pages.length}</small>
        </h2>
        <IconButton icon="plus" label="Adicionar página" onClick={onAdd} />
      </div>
      <div className="pages-list">
        {project.pages.map((page, i) => (
          <button
            key={page.id}
            className="page-thumbnail"
            aria-label={`Página ${i + 1}: ${page.title}`}
            aria-current={page.id === activeId ? "page" : undefined}
            onClick={() => onSelect(page.id)}
          >
            <div className="thumbnail-frame">
              <div
                style={{
                  transform: `scale(${148 / page.width})`,
                  transformOrigin: "0 0",
                }}
              >
                <Artboard
                  page={page}
                  assets={project.assets}
                  resolveAsset={resolveAsset}
                  mode="editor"
                />
              </div>
            </div>
            <span>
              <b>{String(i + 1).padStart(2, "0")}</b> {page.title}
            </span>
          </button>
        ))}
      </div>
      <div className="panel-actions">
        <IconButton
          icon="copy"
          label="Duplicar página"
          disabled={index < 0}
          onClick={onDuplicate}
        />
        <IconButton
          icon="up"
          label="Página anterior na ordem"
          disabled={index <= 0}
          onClick={() => onReorder(index - 1)}
        />
        <IconButton
          icon="down"
          label="Página seguinte na ordem"
          disabled={index < 0 || index === project.pages.length - 1}
          onClick={() => onReorder(index + 1)}
        />
        <IconButton
          icon="trash"
          label="Excluir página"
          disabled={index < 0}
          onClick={onDelete}
        />
      </div>
    </aside>
  );
}
