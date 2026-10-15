import { useState } from "react";
import type {
  BrandProject,
  Page,
  TextNode,
  ImageNode,
  ShapeNode,
  MockupNode,
} from "../../core/project";
import {
  findNode,
  type DocumentCommand,
  type NodePatch,
} from "../../core/commands";
import { nodeBounds, unionBounds } from "../../core/geometry";
import { IconButton } from "../editor/Toolbar";
/** Local drafts permit intermediate '-', blank and decimal input. Commit only
 * valid complete values on blur, once per user edit. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft ?? Number(value.toFixed(3))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => {
          const number = e.target.valueAsNumber;
          if (
            Number.isFinite(number) &&
            (min === undefined || number >= min) &&
            (max === undefined || number <= max) &&
            number !== value
          )
            onChange(number);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        key={value}
        aria-label={label}
        defaultValue={value}
        onBlur={(e) => {
          if (e.currentTarget.value !== value) onChange(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
export function PropertiesPanel({
  project,
  page,
  selected,
  onCommands,
  onDuplicate,
  onDelete,
  onGroup,
  onUngroup,
  onReorder,
}: {
  project: BrandProject;
  page: Page;
  selected: string[];
  onCommands: (commands: DocumentCommand[]) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup: () => void;
  onUngroup: () => void;
  onReorder: (direction: number) => void;
}) {
  const locations = selected.flatMap((id) => {
    const l = findNode(project, page.id, id);
    return l ? [l] : [];
  });
  const node = locations[0]?.node;
  const multiple = locations.length > 1;
  const patch = (update: NodePatch) =>
    onCommands(
      locations.map((l) => ({
        type: "node.update",
        pageId: page.id,
        nodeId: l.node.id,
        patch: update,
      })),
    );
  const bounds = locations.length
    ? unionBounds(
        locations.map((l) =>
          nodeBounds(
            l.node.transform,
            l.ancestors.map((a) => a.transform),
          ),
        ),
      )
    : undefined;
  const geometry = (
    key: "x" | "y" | "width" | "height" | "rotation",
    value: number,
  ) => {
    if (multiple && (key === "x" || key === "y")) {
      onCommands([
        {
          type: "node.move",
          pageId: page.id,
          nodeIds: selected,
          source: "keyboard",
          delta: {
            x: key === "x" ? value - bounds!.x : 0,
            y: key === "y" ? value - bounds!.y : 0,
          },
        },
      ]);
      return;
    }
    patch({ transform: { [key]: value } });
  };
  return (
    <section className="properties-panel" aria-label="Propriedades">
      <div className="panel-section-heading">
        <h3>
          {node
            ? multiple
              ? `${locations.length} objetos`
              : "Propriedades"
            : "Prancheta"}
        </h3>
        <small>{node?.type ?? "1920 × 1080"}</small>
      </div>
      {node ? (
        <>
          <TextField
            label="Nome do objeto"
            value={multiple ? "Seleção múltipla" : node.name}
            onChange={(name) => patch({ name })}
          />
          <fieldset
            disabled={locations.some(
              (l) => l.node.locked || l.ancestors.some((a) => a.locked),
            )}
          >
            <legend>Transformação</legend>
            <div className="fields-grid">
              {(["x", "y", "width", "height", "rotation"] as const).map(
                (key, i) => (
                  <NumberField
                    key={key}
                    label={["X", "Y", "Largura", "Altura", "Rotação"][i]}
                    value={
                      multiple && (key === "x" || key === "y")
                        ? bounds![key]
                        : node.transform[key]
                    }
                    min={key === "width" || key === "height" ? 1 : undefined}
                    onChange={(v) => geometry(key, v)}
                  />
                ),
              )}
              <NumberField
                label="Opacidade"
                value={node.opacity * 100}
                min={0}
                max={100}
                onChange={(v) => patch({ opacity: v / 100 })}
              />
            </div>
            {multiple && (
              <p className="control-note">
                X/Y movem a seleção em conjunto. Tamanho e rotação são aplicados
                a cada objeto.
              </p>
            )}
            {!multiple && node.type === "text" && (
              <TextProperties node={node} onPatch={patch} />
            )}
            {!multiple && node.type === "image" && (
              <ImageProperties node={node} project={project} onPatch={patch} />
            )}
            {!multiple && node.type === "shape" && (
              <ShapeProperties node={node} onPatch={patch} />
            )}
            {!multiple && node.type === "mockup" && (
              <MockupProperties node={node} project={project} onPatch={patch} />
            )}
          </fieldset>
          <div className="object-actions">
            <button onClick={onGroup} disabled={!multiple}>
              Agrupar
            </button>
            <button
              onClick={onUngroup}
              disabled={node.type !== "group" || multiple}
            >
              Desagrupar
            </button>
            <IconButton
              icon="up"
              label="Trazer camada à frente"
              onClick={() => onReorder(1)}
            />
            <IconButton
              icon="down"
              label="Enviar camada para trás"
              onClick={() => onReorder(-1)}
            />
            <IconButton
              icon="copy"
              label="Duplicar objeto"
              onClick={onDuplicate}
            />
            <IconButton
              icon="trash"
              label="Excluir objeto"
              onClick={onDelete}
            />
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={node.locked}
              onChange={(e) => patch({ locked: e.target.checked })}
            />
            Bloqueado
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={node.visible}
              onChange={(e) =>
                onCommands(
                  locations.map((l) => ({
                    type: "node.update",
                    pageId: page.id,
                    nodeId: l.node.id,
                    allowLocked: true,
                    patch: { visible: e.target.checked },
                  })),
                )
              }
            />
            Visível
          </label>
          <p className="control-note">
            {node.origin.kind === "suggested"
              ? "Sugestão"
              : node.manuallyEdited
                ? "Editado manualmente"
                : "Conteúdo do projeto"}{" "}
            ·{" "}
            {node.approval.status === "approved"
              ? "Aprovado"
              : "Aprovação pendente"}
          </p>
        </>
      ) : (
        <>
          <TextField
            label="Título da página"
            value={page.title}
            onChange={(title) =>
              onCommands([
                { type: "page.update", pageId: page.id, patch: { title } },
              ])
            }
          />
          <label className="field">
            <span>Fundo da página</span>
            <input
              aria-label="Fundo da página"
              type="color"
              value={page.background.slice(0, 7)}
              onChange={(e) =>
                onCommands([
                  {
                    type: "page.update",
                    pageId: page.id,
                    patch: { background: e.target.value },
                  },
                ])
              }
            />
          </label>
          <p className="panel-empty">
            Selecione um objeto na prancheta ou em Camadas. Use Shift para
            selecionar vários.
          </p>
        </>
      )}
    </section>
  );
}
function TextProperties({
  node,
  onPatch,
}: {
  node: TextNode;
  onPatch: (patch: NodePatch) => void;
}) {
  return (
    <>
      <legend>Texto</legend>
      <label className="field">
        <span>Conteúdo do texto</span>
        <textarea
          key={node.id + node.text}
          aria-label="Conteúdo do texto"
          rows={4}
          defaultValue={node.text}
          onBlur={(e) => {
            if (e.currentTarget.value !== node.text)
              onPatch({ text: e.currentTarget.value });
          }}
        />
      </label>
      <TextField
        label="Fonte"
        value={node.style.fontFamily}
        onChange={(fontFamily) => onPatch({ style: { fontFamily } })}
      />
      <div className="fields-grid">
        <NumberField
          label="Tamanho"
          value={node.style.fontSize}
          min={1}
          onChange={(fontSize) => onPatch({ style: { fontSize } })}
        />
        <label className="field">
          <span>Peso</span>
          <select
            aria-label="Peso"
            value={node.style.fontWeight}
            onChange={(e) =>
              onPatch({ style: { fontWeight: Number(e.target.value) } })
            }
          >
            {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        <NumberField
          label="Entrelinha"
          value={node.style.lineHeight}
          min={0.1}
          step={0.1}
          onChange={(lineHeight) => onPatch({ style: { lineHeight } })}
        />
        <NumberField
          label="Espaçamento"
          value={node.style.letterSpacing}
          step={0.1}
          onChange={(letterSpacing) => onPatch({ style: { letterSpacing } })}
        />
      </div>
      <label className="field">
        <span>Cor do texto</span>
        <input
          aria-label="Cor do texto"
          type="color"
          value={node.style.color.slice(0, 7)}
          onChange={(e) => onPatch({ style: { color: e.target.value } })}
        />
      </label>
      <label className="field">
        <span>Alinhamento do texto</span>
        <select
          aria-label="Alinhamento do texto"
          value={node.style.align}
          onChange={(e) =>
            onPatch({
              style: { align: e.target.value as TextNode["style"]["align"] },
            })
          }
        >
          <option value="left">Esquerda</option>
          <option value="center">Centro</option>
          <option value="right">Direita</option>
          <option value="justify">Justificado</option>
        </select>
      </label>
      <label className="field">
        <span>Alinhamento vertical</span>
        <select
          aria-label="Alinhamento vertical"
          value={node.style.verticalAlign}
          onChange={(e) =>
            onPatch({
              style: {
                verticalAlign: e.target
                  .value as TextNode["style"]["verticalAlign"],
              },
            })
          }
        >
          <option value="top">Topo</option>
          <option value="middle">Meio</option>
          <option value="bottom">Base</option>
        </select>
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={node.style.fontStyle === "italic"}
          onChange={(e) =>
            onPatch({
              style: { fontStyle: e.target.checked ? "italic" : "normal" },
            })
          }
        />
        Itálico
      </label>
    </>
  );
}
function ImageProperties({
  node,
  project,
  onPatch,
}: {
  node: ImageNode;
  project: BrandProject;
  onPatch: (patch: NodePatch) => void;
}) {
  const crop = node.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  return (
    <>
      <legend>Imagem</legend>
      <AssetSelect
        label="Arquivo da imagem"
        value={node.assetId}
        project={project}
        onChange={(assetId) => onPatch({ assetId })}
      />
      <TextField
        label="Descrição da imagem"
        value={node.alt ?? ""}
        onChange={(alt) => onPatch({ alt })}
      />
      <label className="field">
        <span>Ajuste da imagem</span>
        <select
          aria-label="Ajuste da imagem"
          value={node.fit}
          onChange={(e) => onPatch({ fit: e.target.value as ImageNode["fit"] })}
        >
          <option value="contain">Conter</option>
          <option value="cover">Cobrir</option>
          <option value="fill">Esticar</option>
        </select>
      </label>
      <p className="control-note">
        Recorte normalizado · X/Y definem a origem focal da área visível.
      </p>
      <div className="fields-grid">
        {(["x", "y", "width", "height"] as const).map((key, i) => (
          <NumberField
            key={key}
            label={["Foco X", "Foco Y", "Recorte largura", "Recorte altura"][i]}
            value={crop[key]}
            step={0.05}
            min={key === "width" || key === "height" ? 0.01 : 0}
            max={1}
            onChange={(v) => onPatch({ crop: { ...crop, [key]: v } })}
          />
        ))}
      </div>
      <button
        onClick={() => onPatch({ crop: { x: 0, y: 0, width: 1, height: 1 } })}
      >
        Redefinir recorte
      </button>
    </>
  );
}
function ShapeProperties({
  node,
  onPatch,
}: {
  node: ShapeNode;
  onPatch: (patch: NodePatch) => void;
}) {
  return (
    <>
      <legend>Forma</legend>
      <label className="field">
        <span>Tipo de forma</span>
        <select
          aria-label="Tipo de forma"
          value={node.shape}
          onChange={(e) =>
            onPatch({ shape: e.target.value as ShapeNode["shape"] })
          }
        >
          {[
            "rectangle",
            "ellipse",
            "line",
            ...(node.shape === "path" ? ["path"] : []),
          ].map((s, i) => (
            <option value={s} key={s}>
              {["Retângulo", "Elipse", "Linha", "Caminho"][i]}
            </option>
          ))}
        </select>
      </label>
      {(["fill", "stroke"] as const).map((key, i) => (
        <TextField
          key={key}
          label={i ? "Contorno" : "Preenchimento"}
          value={node.style[key]}
          onChange={(v) => onPatch({ style: { [key]: v } })}
        />
      ))}
      <NumberField
        label="Espessura"
        value={node.style.strokeWidth}
        min={0}
        onChange={(strokeWidth) => onPatch({ style: { strokeWidth } })}
      />
      <NumberField
        label="Cantos"
        value={node.style.cornerRadius}
        min={0}
        onChange={(cornerRadius) => onPatch({ style: { cornerRadius } })}
      />
    </>
  );
}
function AssetSelect({
  label,
  value,
  project,
  onChange,
}: {
  label: string;
  value: string;
  project: BrandProject;
  onChange: (id: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Selecionar arquivo
        </option>
        {project.assets
          .filter((a) => a.mimeType.startsWith("image/"))
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
      </select>
    </label>
  );
}
function MockupProperties({
  node,
  project,
  onPatch,
}: {
  node: MockupNode;
  project: BrandProject;
  onPatch: (patch: NodePatch) => void;
}) {
  return (
    <>
      <legend>Aplicação</legend>
      {node.artworkAssetId && (
        <AssetSelect
          label="Arte da aplicação"
          value={node.artworkAssetId}
          project={project}
          onChange={(artworkAssetId) =>
            onPatch({ artworkAssetId, approval: { status: "pending" } })
          }
        />
      )}
      <p className="control-note">
        A troca da arte preserva cantos, máscara e cena. Revise a composição
        antes de aprovar.
      </p>
    </>
  );
}
