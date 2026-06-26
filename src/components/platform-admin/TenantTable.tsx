"use client";

/**
 * Platform Admin — table des tenants/owners. Dense, monospace pour les IDs,
 * cliquable pour ouvrir le détail. Aucun secret ; owner_id raccourci.
 */

import { SPACING, FONT, FONT_WEIGHT } from "@/lib/ui/tokens";
import type { PlatformTenant } from "@/lib/platform-admin/types";
import { TenantStatusChip } from "./chips";

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: FONT.nano,
  fontWeight: FONT_WEIGHT.medium,
  color: "var(--ct-text-faint)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  borderBottom: "1px solid var(--ct-border-soft)",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  fontSize: FONT.sm,
  color: "var(--ct-text-body)",
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  borderBottom: "1px solid var(--ct-border-soft)",
  whiteSpace: "nowrap",
};

const mono: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: FONT.xs,
  color: "var(--ct-text-muted)",
};

export function TenantTable({
  tenants,
  selectedOwnerId,
  onSelect,
}: {
  tenants: PlatformTenant[];
  selectedOwnerId: string | null;
  onSelect: (ownerId: string) => void;
}) {
  if (!tenants.length) {
    return (
      <div style={{ padding: SPACING.xxl, textAlign: "center", color: "var(--ct-text-faint)", fontSize: FONT.sm }}>
        Aucun owner connu. La plateforme n&apos;a pas encore d&apos;identité enregistrée côté auth.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Owner</th>
            <th style={th}>Status</th>
            <th style={th}>Swarms</th>
            <th style={th}>Runs</th>
            <th style={th}>Actifs</th>
            <th style={th}>Quota</th>
            <th style={th}>Outils</th>
            <th style={th}>Incidents</th>
            <th style={th}>Dernière activité</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((t) => {
            const selected = t.ownerId === selectedOwnerId;
            const toolsOn = Object.values(t.tools).filter((s) => s === "enabled").length;
            const toolsFail = Object.values(t.tools).filter((s) => s === "fail_closed").length;
            return (
              <tr
                key={t.ownerId}
                onClick={() => onSelect(t.ownerId)}
                style={{
                  cursor: "pointer",
                  background: selected ? "var(--ct-accent-soft)" : "transparent",
                }}
              >
                <td style={td}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ color: "var(--ct-text-strong)", fontWeight: FONT_WEIGHT.medium }}>
                      {t.label}
                    </span>
                    <span style={mono} title="owner_id (raccourci)">{shortId(t.ownerId)}</span>
                  </div>
                </td>
                <td style={td}><TenantStatusChip status={t.status} /></td>
                <td style={td}>{t.swarmsCount}</td>
                <td style={td}>{t.runsCount}</td>
                <td style={{ ...td, color: t.activeRunsCount > 0 ? "var(--ct-status-running)" : "var(--ct-text-body)" }}>
                  {t.activeRunsCount}
                </td>
                <td style={{ ...td, color: "var(--ct-text-faint)", fontSize: FONT.xs }}>
                  {t.quota.notConfigured ? "n/c" : `${t.quota.used}/${t.quota.limit ?? "∞"}`}
                </td>
                <td style={td}>
                  <span style={{ fontSize: FONT.xs }}>
                    <span style={{ color: "var(--ct-state-ok)" }}>{toolsOn} on</span>
                    {toolsFail > 0 && (
                      <span style={{ color: "var(--ct-status-failed)" }}> · {toolsFail} fail-closed</span>
                    )}
                  </span>
                </td>
                <td style={{ ...td, color: t.incidentsCount > 0 ? "var(--ct-status-failed)" : "var(--ct-text-faint)" }}>
                  {t.incidentsCount}
                </td>
                <td style={{ ...td, color: "var(--ct-text-muted)", fontSize: FONT.xs }}>
                  {t.lastActivityAt ? new Date(t.lastActivityAt).toLocaleString("fr-FR") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function shortId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}
