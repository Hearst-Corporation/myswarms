"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { SPACING, RADIUS, FONT, FONT_WEIGHT, LINE_HEIGHT, LETTER_SPACING, SIZE } from "@/lib/ui/tokens";
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
  width: SIZE.dotSm,
  height: SIZE.dotSm,
  background: "var(--ct-border-strong)",
  border: "none",
} as const;

function MapNodeView({ data, selected }: NodeProps<MapNode>) {
  const accent = data.status ? statusColor(data.status) : kindColor(data.kind);
  const edgeColor = selected ? accent : "var(--ct-border)";
  return (
    <div
      style={{
        minWidth: SIZE.nodeMinW,
        maxWidth: SIZE.nodeMaxW,
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
        borderRadius: RADIUS.nav,
        padding: `${SPACING.sm}px ${SPACING.md}px`,
        boxShadow: selected
          ? `0 0 0 2px color-mix(in srgb, ${accent} 45%, transparent), 0 8px 22px var(--ct-overlay-dark-strong)`
          : "0 2px 8px var(--ct-overlay-dark)",
        cursor: "pointer",
      }}
    >
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <div style={{ display: "flex", alignItems: "center", gap: SPACING.xxs, marginBottom: SPACING.hair }}>
        <span
          style={{
            width: SIZE.dot,
            height: SIZE.dot,
            borderRadius: "50%",
            background: accent,
            flexShrink: 0,
            boxShadow: data.status === "running" ? `0 0 6px ${accent}` : "none",
          }}
        />
        <span
          style={{
            fontSize: FONT.micro,
            letterSpacing: LETTER_SPACING.mid,
            textTransform: "uppercase",
            color: "var(--ct-text-faint)",
          }}
        >
          {KIND_LABEL[data.kind]}
        </span>
      </div>
      <div
        style={{
          fontSize: FONT.sm,
          fontWeight: FONT_WEIGHT.semibold,
          color: "var(--ct-text-strong)",
          lineHeight: LINE_HEIGHT.snug,
        }}
      >
        {data.label}
      </div>
      {data.sub ? (
        <div style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", marginTop: SPACING.hair }}>
          {data.sub}
        </div>
      ) : null}
      {data.desc ? (
        <div
          style={{
            fontSize: FONT.nano,
            color: "var(--ct-text-faint)",
            marginTop: SPACING.hair,
            lineHeight: LINE_HEIGHT.cozy,
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
