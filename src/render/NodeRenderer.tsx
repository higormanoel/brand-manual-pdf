import type { CSSProperties } from "react";
import type { AssetRecord } from "../core/assets";
import type { DocumentNode, ImageNode } from "../core/nodes";
import { projectToQuad } from "../mockups/projection";
import { textCSS } from "./textMeasurement";
export type AssetResolver = (asset: AssetRecord) => string;
export interface NodeRendererProps {
  node: DocumentNode;
  assets: readonly AssetRecord[];
  resolveAsset?: AssetResolver;
}
export function NodeRenderer({
  node,
  assets,
  resolveAsset = (asset) => `/${asset.path}`,
}: NodeRendererProps) {
  if (!node.visible) return null;
  const { x, y, width, height, rotation, scaleX, scaleY } = node.transform;
  const style: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width,
    height,
    transformOrigin: "0 0",
    transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`,
    opacity: node.opacity,
    boxSizing: "border-box",
  };
  const url = (id: string | undefined) => {
    const asset = assets.find((a) => a.id === id);
    return asset ? resolveAsset(asset) : undefined;
  };
  const image = (
    id: string | undefined,
    extra: CSSProperties = {},
    alt = "",
  ) =>
    id ? (
      <img
        data-asset-id={id}
        src={url(id)}
        alt={alt}
        draggable={false}
        style={{ display: "block", width: "100%", height: "100%", ...extra }}
      />
    ) : null;
  let content;
  if (node.type === "text")
    content = (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: {
            top: "flex-start",
            middle: "center",
            bottom: "flex-end",
          }[node.style.verticalAlign],
        }}
      >
        <div data-text-content style={textCSS(node.style)}>
          {node.text}
        </div>
      </div>
    );
  else if (node.type === "image") {
    style.overflow = "hidden";
    const crop: ImageNode["crop"] = node.crop;
    content = image(
      node.assetId,
      crop
        ? {
            position: "absolute",
            width: `${100 / crop.width}%`,
            height: `${100 / crop.height}%`,
            left: `${(-100 * crop.x) / crop.width}%`,
            top: `${(-100 * crop.y) / crop.height}%`,
            objectFit: node.fit,
          }
        : { objectFit: node.fit },
      node.alt,
    );
  } else if (node.type === "shape") {
    const common = {
      fill: node.style.fill,
      stroke: node.style.stroke,
      strokeWidth: node.style.strokeWidth,
    };
    content = (
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", overflow: "visible" }}
      >
        {node.shape === "ellipse" ? (
          <ellipse
            cx={width / 2}
            cy={height / 2}
            rx={Math.max(0, (width - node.style.strokeWidth) / 2)}
            ry={Math.max(0, (height - node.style.strokeWidth) / 2)}
            {...common}
          />
        ) : node.shape === "line" ? (
          <line x1={0} y1={height / 2} x2={width} y2={height / 2} {...common} />
        ) : node.shape === "path" ? (
          <path d={node.path} {...common} />
        ) : (
          <rect
            x={node.style.strokeWidth / 2}
            y={node.style.strokeWidth / 2}
            width={Math.max(0, width - node.style.strokeWidth)}
            height={Math.max(0, height - node.style.strokeWidth)}
            rx={node.style.cornerRadius}
            {...common}
          />
        )}
      </svg>
    );
  } else {
    const children = node.children.map((child) => (
      <NodeRenderer
        key={child.id}
        node={child}
        assets={assets}
        resolveAsset={resolveAsset}
      />
    ));
    if (node.type === "group") content = children;
    else {
      let projection: CSSProperties | undefined;
      if (node.quad) {
        try {
          projection = {
            position: "absolute",
            left: 0,
            top: 0,
            width: 1,
            height: 1,
            transformOrigin: "0 0",
            transform: `matrix3d(${projectToQuad(node.quad).join(",")})`,
          };
        } catch {
          /* preflight reports invalid geometry; leave scene visible. */
        }
      }
      const mask = url(node.maskAssetId);
      content = (
        <>
          {image(node.maskAssetId, { display: "none" })}
          {image(node.sceneAssetId || node.backgroundAssetId, {
            position: "absolute",
          })}
          <div
            style={{
              position: "absolute",
              inset: 0,
              ...(mask
                ? {
                    maskImage: `url("${mask}")`,
                    maskSize: "100% 100%",
                    maskRepeat: "no-repeat",
                  }
                : {}),
            }}
          >
            {projection ? (
              <div data-projection style={projection}>
                {image(node.artworkAssetId)}
              </div>
            ) : (
              image(node.artworkAssetId, { position: "absolute" })
            )}
            {children}
          </div>
          {image(node.overlayAssetId, { position: "absolute", inset: 0 })}
        </>
      );
    }
  }
  return (
    <div data-node-id={node.id} data-node-type={node.type} style={style}>
      {content}
    </div>
  );
}
