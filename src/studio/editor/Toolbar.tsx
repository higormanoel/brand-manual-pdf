import type { ReactNode } from "react";
export type IconName =
  | "select"
  | "hand"
  | "text"
  | "shape"
  | "image"
  | "undo"
  | "redo"
  | "plus"
  | "copy"
  | "trash"
  | "up"
  | "down"
  | "eye"
  | "lock"
  | "grid"
  | "fit"
  | "layers"
  | "pages"
  | "settings"
  | "download"
  | "menu";
const paths: Record<IconName, ReactNode> = {
  select: <path d="m4 3 12 8-6 1-3 6z" />,
  hand: (
    <path d="M6 10V5a1.5 1.5 0 0 1 3 0v5-6a1.5 1.5 0 0 1 3 0v6-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5c0 4-3 6-6 6H9l-6-7a1.5 1.5 0 0 1 2-2l3 3" />
  ),
  text: <path d="M3 4h14M10 4v13M6 17h8" />,
  shape: <rect x="3" y="3" width="14" height="14" />,
  image: (
    <>
      <rect x="2" y="3" width="16" height="14" />
      <path d="m2 14 5-5 4 4 3-3 4 4" />
      <circle cx="13" cy="7" r="1" />
    </>
  ),
  undo: (
    <>
      <path d="m7 3-4 4 4 4M3 7h8a6 6 0 0 1 0 12" />
    </>
  ),
  redo: <path d="m13 3 4 4-4 4m4-4H9a6 6 0 0 0 0 12" />,
  plus: <path d="M10 3v14M3 10h14" />,
  copy: (
    <>
      <rect x="7" y="7" width="10" height="10" />
      <path d="M13 7V3H3v10h4" />
    </>
  ),
  trash: <path d="M3 5h14M7 5V2h6v3M5 5l1 13h8l1-13M8 8v7m4-7v7" />,
  up: <path d="m4 12 6-6 6 6" />,
  down: <path d="m4 8 6 6 6-6" />,
  eye: (
    <>
      <path d="M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z" />
      <circle cx="10" cy="10" r="2" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="9" width="12" height="9" />
      <path d="M6 9V6a4 4 0 0 1 8 0v3" />
    </>
  ),
  grid: (
    <>
      <rect x="2" y="2" width="16" height="16" />
      <path d="M7 2v16M13 2v16M2 7h16M2 13h16" />
    </>
  ),
  fit: <path d="M2 7V2h5m6 0h5v5M2 13v5h5m6 0h5v-5M6 6h8v8H6z" />,
  layers: (
    <>
      <path d="m2 7 8-5 8 5-8 5zM2 11l8 5 8-5M2 15l8 5 8-5" />
    </>
  ),
  pages: (
    <>
      <rect x="5" y="2" width="12" height="16" />
      <path d="M2 5v14h12" />
    </>
  ),
  settings: (
    <>
      <path d="M3 5h14M3 10h14M3 15h14" />
      <circle cx="7" cy="5" r="2" />
      <circle cx="13" cy="10" r="2" />
      <circle cx="8" cy="15" r="2" />
    </>
  ),
  download: <path d="M10 2v11m-4-4 4 4 4-4M3 13v5h14v-5" />,
  menu: <path d="M3 5h14M3 10h14M3 15h14" />,
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function IconButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
export type Tool = "select" | "hand";
export function Toolbar({
  tool,
  onTool,
  onText,
  onShape,
  onImage,
}: {
  tool: Tool;
  onTool: (tool: Tool) => void;
  onText: () => void;
  onShape: () => void;
  onImage: () => void;
}) {
  return (
    <nav className="tool-rail" aria-label="Ferramentas">
      <IconButton
        icon="select"
        label="Selecionar (V)"
        active={tool === "select"}
        onClick={() => onTool("select")}
      />
      <IconButton
        icon="hand"
        label="Mover visualização (H)"
        active={tool === "hand"}
        onClick={() => onTool("hand")}
      />
      <span className="tool-divider" />
      <IconButton icon="text" label="Inserir texto" onClick={onText} />
      <IconButton icon="shape" label="Inserir forma" onClick={onShape} />
      <IconButton icon="image" label="Inserir imagem" onClick={onImage} />
    </nav>
  );
}
