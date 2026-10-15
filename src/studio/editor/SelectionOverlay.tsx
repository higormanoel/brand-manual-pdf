import type { CSSProperties, PointerEvent } from "react";
import type { DocumentNode } from "../../core/nodes";
import { worldMatrix } from "../../core/geometry";
import type { NodeLocation } from "../../core/commands";
export type Handle = "nw" | "ne" | "sw" | "se";
export function selectionStyle(
  node: DocumentNode,
  ancestors: NodeLocation["ancestors"] = [],
): CSSProperties {
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width: node.transform.width,
    height: node.transform.height,
    transformOrigin: "0 0",
    transform: `matrix(${worldMatrix([...ancestors.map((n) => n.transform), node.transform]).join(",")})`,
  };
}
export function SelectionOverlay({
  locations,
  zoom,
  onResize,
}: {
  locations: NodeLocation[];
  zoom: number;
  onResize: (
    event: PointerEvent,
    location: NodeLocation,
    handle: Handle,
  ) => void;
}) {
  return (
    <div className="selection-overlays">
      {locations
        .filter((l) => l.node.visible)
        .map((location) => (
          <div
            key={location.node.id}
            className="selection-box"
            style={{
              ...selectionStyle(location.node, location.ancestors),
              borderWidth: 1 / zoom,
            }}
            data-selection-id={location.node.id}
          >
            {!location.node.locked &&
              !location.ancestors.some((a) => a.locked) &&
              (["nw", "ne", "sw", "se"] as const).map((handle) => (
                <button
                  key={handle}
                  className={`resize-handle resize-${handle}`}
                  aria-label={`Redimensionar ${location.node.name} ${handle}`}
                  style={{
                    width: 7 / zoom,
                    height: 7 / zoom,
                    borderWidth: 1 / zoom,
                  }}
                  onPointerDown={(e) => onResize(e, location, handle)}
                />
              ))}
          </div>
        ))}
    </div>
  );
}
