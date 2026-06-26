"use client";

/**
 * Platform Admin — header overview : KPIs tenant, statut backend, security gates.
 * Dense, déterministe. Aucun secret.
 */

import { SPACING, RADIUS, FONT, FONT_WEIGHT } from "@/lib/ui/tokens";
import type {
  BackendStatus,
  PlatformOverview,
  SecurityGate,
} from "@/lib/platform-admin/types";

function Kpi({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div
      style={{
        flex: "1 1 0",
        minWidth: 92,
        padding: `${SPACING.md}px ${SPACING.lg}px`,
        borderRadius: RADIUS.md,
        border: "1px solid var(--ct-border-soft)",
        background: accent ? "var(--ct-accent-soft)" : "var(--ct-overlay-dark)",
      }}
    >
      <div style={{ fontSize: FONT.display, fontWeight: FONT_WEIGHT.medium, color: accent ? "var(--ct-accent)" : "var(--ct-text-strong)", lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: FONT.xxs, color: "var(--ct-text-muted)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
    </div>
  );
}

function GateRow({ gate }: { gate: SecurityGate }) {
  const color =
    gate.status === "enforced" ? "var(--ct-state-ok)" : gate.status === "degraded" ? "var(--ct-status-failed)" : "var(--ct-text-faint)";
  return (
    <div title={gate.detail} style={{ display: "inline-flex", alignItems: "center", gap: SPACING.xxs, fontSize: FONT.xxs, color: "var(--ct-text-muted)" }}>
      <span style={{ color, fontWeight: FONT_WEIGHT.medium }}>●</span>
      <span style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>{gate.key}</span>
      <span style={{ color: "var(--ct-text-faint)" }}>{gate.label}</span>
    </div>
  );
}

export function Overview({
  overview,
  backend,
  gates,
}: {
  overview: PlatformOverview | null;
  backend: BackendStatus | null;
  gates: SecurityGate[];
}) {
  return (
    <section className="ct-card" style={{ padding: SPACING.lx, display: "flex", flexDirection: "column", gap: SPACING.lg }}>
      {/* KPIs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING.sm }}>
        <Kpi label="Owners" value={overview?.totalOwners ?? 0} accent />
        <Kpi label="Active" value={overview?.active ?? 0} />
        <Kpi label="Pending" value={overview?.pending ?? 0} />
        <Kpi label="Suspended" value={overview?.suspended ?? 0} />
        <Kpi label="Blocked" value={overview?.blocked ?? 0} />
        <Kpi label="Internal" value={overview?.internal ?? 0} />
        <Kpi label="Runs / 24h" value={overview?.runsToday ?? 0} />
        <Kpi label="Runs / 7j" value={overview?.runsWeek ?? 0} />
        <Kpi label="Active runs" value={overview?.activeRuns ?? 0} />
        <Kpi label="Mappings n/c" value={overview?.unconfiguredMappings ?? 0} />
      </div>

      {/* Backend + gates */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING.xl, alignItems: "center", paddingTop: SPACING.sm, borderTop: "1px solid var(--ct-border-soft)" }}>
        <div style={{ display: "flex", gap: SPACING.lg, flexWrap: "wrap" }}>
          <BackendDot ok={Boolean(backend?.engineConfigured)} label="Engine" />
          <BackendDot ok={Boolean(backend?.cortexConfigured)} label="Cortex" />
          <BackendDot ok={Boolean(backend?.schedulerOwnerConfigured)} label="Scheduler" />
        </div>
        <div style={{ display: "flex", gap: SPACING.md, flexWrap: "wrap", marginLeft: "auto" }}>
          {gates.map((g) => (
            <GateRow key={g.key} gate={g} />
          ))}
        </div>
      </div>
      {backend?.syncedAt && (
        <div style={{ fontSize: FONT.nano, color: "var(--ct-text-faint)" }}>
          Dernière synchro : {new Date(backend.syncedAt).toLocaleString("fr-FR")}
        </div>
      )}
    </section>
  );
}

function BackendDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: SPACING.xxs, fontSize: FONT.xs, color: "var(--ct-text-muted)" }}>
      <span style={{ color: ok ? "var(--ct-state-ok)" : "var(--ct-text-faint)" }}>●</span>
      {label}
      <span style={{ color: ok ? "var(--ct-state-ok)" : "var(--ct-text-faint)" }}>{ok ? "configuré" : "non configuré"}</span>
    </span>
  );
}
