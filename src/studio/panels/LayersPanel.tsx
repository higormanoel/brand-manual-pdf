import type { DocumentNode, Page } from "../../core/project";
import type { DocumentCommand } from "../../core/commands";
import { Icon, IconButton } from "../editor/Toolbar";
export function LayersPanel({
  page,
  selected,
  onSelect,
  onCommands,
}: {
  page: Page;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onCommands: (commands: DocumentCommand[]) => void;
}) {
  const render = (nodes: DocumentNode[], depth = 0) =>
    [...nodes].reverse().map((node) => (
      <div key={node.id}>
        <div
          className={`layer-row ${selected.includes(node.id) ? "selected" : ""}`}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <button
            className="layer-select"
            aria-label={`Camada ${node.name}`}
            aria-pressed={selected.includes(node.id)}
            onClick={(event) =>
              onSelect(
                event.shiftKey
                  ? selected.includes(node.id)
                    ? selected.filter((id) => id !== node.id)
                    : [...selected, node.id]
                  : [node.id],
              )
            }
          >
            <Icon
              name={
                node.type === "text"
                  ? "text"
                  : node.type === "image" || node.type === "mockup"
                    ? "image"
                    : node.type === "group"
                      ? "layers"
                      : "shape"
              }
            />
            <span>{node.name || node.type}</span>
          </button>
          <IconButton
            icon="eye"
            label={`${node.visible ? "Ocultar" : "Mostrar"} ${node.name}`}
            active={node.visible}
            onClick={() =>
              onCommands([
                {
                  type: "node.update",
                  pageId: page.id,
                  nodeId: node.id,
                  allowLocked: true,
                  patch: { visible: !node.visible },
                },
              ])
            }
          />
          <IconButton
            icon="lock"
            label={`${node.locked ? "Desbloquear" : "Bloquear"} ${node.name}`}
            active={node.locked}
            onClick={() =>
              onCommands([
                {
                  type: "node.update",
                  pageId: page.id,
                  nodeId: node.id,
                  patch: { locked: !node.locked },
                },
              ])
            }
          />
        </div>
        {(node.type === "group" || node.type === "mockup") &&
          render(node.children, depth + 1)}
      </div>
    ));
  return (
    <section className="layers-panel" aria-label="Camadas da página">
      <div className="panel-section-heading">
        <h3>Camadas</h3>
        <small>Acima → frente</small>
      </div>
      {page.nodes.length ? (
        render(page.nodes)
      ) : (
        <p className="panel-empty">
          Insira texto, imagem ou forma para começar.
        </p>
      )}
    </section>
  );
}
