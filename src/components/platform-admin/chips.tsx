"use client";

/**
 * Platform Admin Console — chips & badges primitifs.
 *
 * Présentation déterministe (control tower) : statuts tenant, statuts run,
 * présence de mapping, permissions d'outils. Couleurs via les CSS vars
 * Cockpit (--ct-status-*, --ct-state-ok, --ct-text-*). Aucun secret affiché.
 */

import { RADIUS, SPACING, FONT, FONT_WEIGHT } from "@/lib/ui/tokens";
import type {
  MappingPresence,
  TenantStatus,
  ToolPermissionStatus,
} from "@/lib/platform-admin/types";

interface ChipStyle {
  color: string;
  bg: string;
  border: string;
  label: string;
}

const TENANT_STATUS_STYLE: Record<TenantStatus, ChipStyle> = {
  active: {
    color: "var(--ct-status-completed)",
    bg: "var(--ct-status-completed-bg)",
    border: "var(--ct-status-completed-border)",
    label: "active",
  },
  pending: {
    color: "var(--ct-status-paused)",
    bg: "var(--ct-status-paused-bg)",
    border: "var(--ct-status-paused-border)",
    label: "pending",
  },
  suspended: {
    color: "var(--ct-status-cancelled)",
    bg: "var(--ct-status-cancelled-bg)",
    border: "var(--ct-status-cancelled-border)",
    label: "suspended",
  },
  blocked: {
    color: "var(--ct-status-failed)",
    bg: "var(--ct-status-failed-bg)",
    border: "var(--ct-status-failed-border)",
    label: "blocked",
  },
  internal: {
    color: "var(--ct-accent)",
    bg: "var(--ct-accent-soft)",
    border: "var(--ct-border-accent)",
    label: "internal",
  },
  unknown: {
    color: "var(--ct-text-faint)",
    bg: "var(--ct-overlay-dark)",
    border: "var(--ct-border-soft)",
    label: "unknown",
  },
};

const baseChip = (s: ChipStyle, title?: string) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: SPACING.xxs,
  padding: `2px ${SPACING.sm}px`,
  borderRadius: RADIUS.full,
  fontSize: FONT.xxs,
  fontWeight: FONT_WEIGHT.medium,
  letterSpacing: "0.02em",
  color: s.color,
  background: s.bg,
  border: `1px solid ${s.border}`,
  textTransform: "uppercase" as const,
  whiteSpace: "nowrap" as const,
  title,
});

export function TenantStatusChip({ status }: { status: TenantStatus }) {
  const s = TENANT_STATUS_STYLE[status] ?? TENANT_STATUS_STYLE.unknown;
  return <span style={baseChip(s)}>{s.label}</span>;
}

/** Chip pour un statut de run runtime (running/completed/failed/...). */
export function RunStatusChip({ status }: { status: string }) {
  const map: Record<string, ChipStyle> = {
    running: { color: "var(--ct-status-running)", bg: "var(--ct-status-running-bg)", border: "var(--ct-status-running-border)", label: "running" },
    pending: { color: "var(--ct-status-paused)", bg: "var(--ct-status-paused-bg)", border: "var(--ct-status-paused-border)", label: "pending" },
    paused_hitl: { color: "var(--ct-status-paused)", bg: "var(--ct-status-paused-bg)", border: "var(--ct-status-paused-border)", label: "paused" },
    completed: { color: "var(--ct-status-completed)", bg: "var(--ct-status-completed-bg)", border: "var(--ct-status-completed-border)", label: "completed" },
    failed: { color: "var(--ct-status-failed)", bg: "var(--ct-status-failed-bg)", border: "var(--ct-status-failed-border)", label: "failed" },
    cancelled: { color: "var(--ct-status-cancelled)", bg: "var(--ct-status-cancelled-bg)", border: "var(--ct-status-cancelled-border)", label: "cancelled" },
  };
  const s = map[status] ?? {
    color: "var(--ct-text-faint)",
    bg: "var(--ct-overlay-dark)",
    border: "var(--ct-border-soft)",
    label: status || "—",
  };
  return <span style={baseChip(s)}>{s.label}</span>;
}

/** Pastille de présence mapping (present/absent) — jamais la valeur. */
export function MappingDot({ presence, label }: { presence: MappingPresence; label: string }) {
  const present = presence === "present";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: SPACING.xxs,
        fontSize: FONT.xxs,
        color: present ? "var(--ct-state-ok)" : "var(--ct-text-faint)",
      }}
      title={`${label}: ${presence}`}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: RADIUS.full,
          background: present ? "var(--ct-state-ok)" : "var(--ct-border-strong)",
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

const TOOL_STATUS_STYLE: Record<ToolPermissionStatus, { color: string; label: string }> = {
  enabled: { color: "var(--ct-state-ok)", label: "on" },
  disabled: { color: "var(--ct-text-faint)", label: "off" },
  not_configured: { color: "var(--ct-text-faint)", label: "n/c" },
  fail_closed: { color: "var(--ct-status-failed)", label: "fail-closed" },
};

export function ToolBadge({ name, status }: { name: string; status: ToolPermissionStatus }) {
  const s = TOOL_STATUS_STYLE[status] ?? TOOL_STATUS_STYLE.not_configured;
  return (
    <span
      title={`${name}: ${status}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: SPACING.xxs,
        fontSize: FONT.xs,
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        color: "var(--ct-text-muted)",
      }}
    >
      <span style={{ color: s.color, fontWeight: FONT_WEIGHT.medium }}>●</span>
      {name}
      <span style={{ color: s.color }}>{s.label}</span>
    </span>
  );
}
