import type { Page } from "../core/schema";
import type { AssetRecord } from "../core/assets";
import { NodeRenderer, type AssetResolver } from "./NodeRenderer";
import "./print.css";
export interface ArtboardProps {
  page: Page;
  assets: readonly AssetRecord[];
  resolveAsset?: AssetResolver;
  mode: "editor" | "print";
}
export function Artboard({ page, assets, resolveAsset, mode }: ArtboardProps) {
  return (
    <div
      className={`artboard-sheet artboard-sheet--${mode}`}
      data-artboard-sheet={page.id}
      style={{ width: page.width, height: page.height }}
    >
      <div
        className="artboard"
        data-artboard-id={page.id}
        data-render-mode={mode}
        role="img"
        aria-label={page.title}
        style={{
          position: "relative",
          width: page.width,
          height: page.height,
          background: page.background,
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        {page.nodes.map((node) => (
          <NodeRenderer
            key={node.id}
            node={node}
            assets={assets}
            resolveAsset={resolveAsset}
          />
        ))}
      </div>
    </div>
  );
}
