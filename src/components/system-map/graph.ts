import { MarkerType } from "@xyflow/react";
import type { MapNode, MapNodeData, MapEdge } from "./types";

const DEFAULT_EDGE_COLOR = "var(--ct-border-strong)";

export function mkNode(id: string, x: number, y: number, data: MapNodeData): MapNode {
  return { id, type: "mapNode", position: { x, y }, data };
}

interface EdgeOpts {
  label?: string;
  animated?: boolean;
  color?: string;
  dashed?: boolean;
}

export function mkEdge(
  id: string,
  source: string,
  target: string,
  o: EdgeOpts = {},
): MapEdge {
  const color = o.color ?? DEFAULT_EDGE_COLOR;
  return {
    id,
    source,
    target,
    type: "smoothstep",
    animated: o.animated ?? false,
    label: o.label,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
    style: {
      stroke: color,
      strokeWidth: o.animated ? 1.7 : 1.2,
      strokeDasharray: o.dashed ? "5 4" : undefined,
    },
    labelStyle: { fill: "var(--ct-text-muted)", fontSize: 9, fontWeight: 500 },
    labelBgStyle: { fill: "var(--ct-surface-1)", fillOpacity: 0.92 },
    labelBgPadding: [4, 2],
    labelBgBorderRadius: 4,
    labelShowBg: true,
  };
}
