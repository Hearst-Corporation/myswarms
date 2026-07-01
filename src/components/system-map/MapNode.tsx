"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { MapNode, MapNodeData, NodeKind, MapStatus } from "./types";

export function statusColor(status?: MapStatus): string {
  switch (status) {
    case "completed":
      return "var(--color-ok)";
    case "running":
      return "var(--color-accent-strong)";
    case "failed":
      return "var(--color-danger)";
    case "template":
    case "report":
      return "var(--color-accent-strong)";
    case "data":
      return "var(--color-content-muted)";
    default:
      return "var(--color-content-faint)";
  }
}

export function kindColor(kind: NodeKind): string {
  switch (kind) {
    case "frontend":
    case "template":
    case "dashboard":
    case "report":
    case "agent":
      return "var(--color-accent-strong)";
    case "backend":
      return "var(--color-ok)";
    case "table":
      return "var(--color-content-faint)";
    default:
      return "var(--color-content-muted)"; // user, data, input
  }
}

export const KIND_LABEL: Record<NodeKind, string> = {
  user: "Session",
  frontend: "Frontend",
  backend: "Backend",
  data: "Data",
  table: "Table",
  template: "Template",
  dashboard: "Dashboard",
  report: "Report",
  input: "Input",
  agent: "Agent",
};

const handleStyle = {
  width: 6,
  height: 6,
  background: "var(--color-line-strong)",
  border: "none",
} as const;

function MapNodeView({ data, selected }: NodeProps<MapNode>) {
  const accent = data.status ? statusColor(data.status) : kindColor(data.kind);
  const edgeColor = selected ? accent : "var(--color-line)";
  return (
    <div
      style={{
        minWidth: 150,
        maxWidth: 230,
        background: "var(--color-surface-2)",
        borderStyle: "solid",
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 3,
        borderTopColor: edgeColor,
        borderRightColor: edgeColor,
        borderBottomColor: edgeColor,
        borderLeftColor: accent,
        borderRadius: "var(--radius-md)",
        padding: "8px 12px",
        boxShadow: selected
          ? `0 0 0 2px color-mix(in srgb, ${accent} 45%, transparent), 0 8px 22px rgba(0,0,0,0.45)`
          : "0 2px 8px rgba(0,0,0,0.30)",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div className="mb-0.5 flex items-center gap-1">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{
            background: accent,
            boxShadow: data.status === "running" ? `0 0 6px ${accent}` : "none",
          }}
        />
        <span className="text-[10px] uppercase tracking-wider text-content-faint">
          {KIND_LABEL[data.kind]}
        </span>
      </div>
      <div className="text-sm font-semibold leading-snug text-content-strong">
        {data.label}
      </div>
      {data.sub ? (
        <div className="mt-0.5 text-xs text-content-muted">{data.sub}</div>
      ) : null}
      {data.desc ? (
        <div className="mt-0.5 text-[10px] leading-relaxed text-content-faint">
          {data.desc}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

export const nodeTypes = { mapNode: MapNodeView };

// helper réutilisé par la MiniMap
export function nodeColor(data: MapNodeData): string {
  return data.status ? statusColor(data.status) : kindColor(data.kind);
}
