"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { MapNode, MapNodeData, NodeKind, MapStatus } from "./types";

export function statusColor(status?: MapStatus): string {
  switch (status) {
    case "completed":
      return "var(--ct-state-ok)";
    case "running":
      return "var(--ct-accent-strong)";
    case "failed":
      return "var(--ct-alert-error-text)";
    case "template":
    case "report":
      return "var(--ct-accent-strong)";
    case "data":
      return "var(--ct-text-muted)";
    default:
      return "var(--ct-text-faint)";
  }
}

export function kindColor(kind: NodeKind): string {
  switch (kind) {
    case "frontend":
    case "template":
    case "dashboard":
    case "report":
    case "agent":
      return "var(--ct-accent-strong)";
    case "backend":
      return "var(--ct-state-ok)";
    case "table":
      return "var(--ct-text-faint)";
    default:
      return "var(--ct-text-muted)"; // user, data, input
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
  background: "var(--ct-border-strong)",
  border: "none",
} as const;

export function MapNodeView({ data, selected }: NodeProps<MapNode>) {
  const accent = data.status ? statusColor(data.status) : kindColor(data.kind);
  const edgeColor = selected ? accent : "var(--ct-border)";
  return (
    <div
      style={{
        minWidth: 150,
        maxWidth: 220,
        background: "var(--ct-surface-2)",
        borderStyle: "solid",
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 3,
        borderTopColor: edgeColor,
        borderRightColor: edgeColor,
        borderBottomColor: edgeColor,
        borderLeftColor: accent,
        borderRadius: 10,
        padding: "8px 11px",
        boxShadow: selected
          ? `0 0 0 2px color-mix(in srgb, ${accent} 45%, transparent), 0 8px 22px rgba(0,0,0,0.4)`
          : "0 2px 8px rgba(0,0,0,0.25)",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: accent,
            flexShrink: 0,
            boxShadow: data.status === "running" ? `0 0 6px ${accent}` : "none",
          }}
        />
        <span
          style={{
            fontSize: 8,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ct-text-faint)",
          }}
        >
          {KIND_LABEL[data.kind]}
        </span>
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ct-text-strong)",
          lineHeight: 1.25,
        }}
      >
        {data.label}
      </div>
      {data.sub ? (
        <div style={{ fontSize: 10, color: "var(--ct-text-muted)", marginTop: 2 }}>
          {data.sub}
        </div>
      ) : null}
      {data.desc ? (
        <div
          style={{
            fontSize: 9.5,
            color: "var(--ct-text-faint)",
            marginTop: 3,
            lineHeight: 1.3,
          }}
        >
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
