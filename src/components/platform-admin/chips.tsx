"use client";

/**
 * Platform Admin Console — chips & badges primitifs.
 *
 * Présentation déterministe (control tower) : statuts tenant, statuts run,
 * présence de mapping, permissions d'outils. Couleurs via le DS MySwarms
 * (Badge tones + utilities tokens). Aucun secret affiché.
 */

import { Badge } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import type {
  MappingPresence,
  TenantStatus,
  ToolPermissionStatus,
} from "@/lib/platform-admin/types";

type Tone = "neutral" | "accent" | "ok" | "running" | "warn" | "danger";

const TENANT_STATUS_TONE: Record<TenantStatus, { tone: Tone; label: string }> = {
  active: { tone: "ok", label: "active" },
  pending: { tone: "warn", label: "pending" },
  suspended: { tone: "warn", label: "suspended" },
  blocked: { tone: "danger", label: "blocked" },
  internal: { tone: "accent", label: "internal" },
  unknown: { tone: "neutral", label: "unknown" },
};

export function TenantStatusChip({ status }: { status: TenantStatus }) {
  const s = TENANT_STATUS_TONE[status] ?? TENANT_STATUS_TONE.unknown;
  return <Badge tone={s.tone} className="uppercase">{s.label}</Badge>;
}

/** Chip pour un statut de run runtime (running/completed/failed/...). */
export function RunStatusChip({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    running: { tone: "running", label: "running" },
    pending: { tone: "warn", label: "pending" },
    paused_hitl: { tone: "warn", label: "paused" },
    completed: { tone: "ok", label: "completed" },
    failed: { tone: "danger", label: "failed" },
    cancelled: { tone: "neutral", label: "cancelled" },
  };
  const s = map[status] ?? { tone: "neutral" as Tone, label: status || "—" };
  return <Badge tone={s.tone} className="uppercase">{s.label}</Badge>;
}

/** Pastille de présence mapping (present/absent) — jamais la valeur. */
export function MappingDot({ presence, label }: { presence: MappingPresence; label: string }) {
  const present = presence === "present";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        present ? "text-[var(--color-ok)]" : "text-content-faint",
      )}
      title={`${label}: ${presence}`}
    >
      <span
        className={cn(
          "size-[7px] shrink-0 rounded-full",
          present ? "bg-[var(--color-ok)]" : "bg-line-strong",
        )}
      />
      {label}
    </span>
  );
}

const TOOL_STATUS_STYLE: Record<ToolPermissionStatus, { className: string; label: string }> = {
  enabled: { className: "text-[var(--color-ok)]", label: "on" },
  disabled: { className: "text-content-faint", label: "off" },
  not_configured: { className: "text-content-faint", label: "n/c" },
  fail_closed: { className: "text-danger", label: "fail-closed" },
};

export function ToolBadge({ name, status }: { name: string; status: ToolPermissionStatus }) {
  const s = TOOL_STATUS_STYLE[status] ?? TOOL_STATUS_STYLE.not_configured;
  return (
    <span
      title={`${name}: ${status}`}
      className="inline-flex items-center gap-1 font-mono text-xs text-content-muted"
    >
      <span className={cn("font-medium", s.className)}>●</span>
      {name}
      <span className={s.className}>{s.label}</span>
    </span>
  );
}
