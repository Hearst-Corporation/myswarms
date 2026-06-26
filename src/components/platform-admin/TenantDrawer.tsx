"use client";

/**
 * Platform Admin — drawer de détail tenant.
 *
 * Charge le détail à la demande (GET /api/admin/platform/tenants/[ownerId]).
 * Sections : identité, permissions, mappings (presence-only), quota,
 * incidents, runs timeline, approvals, governance actions (disabled).
 * Aucun secret, aucun contenu privé brut.
 */

import { useEffect, useState } from "react";
import { SPACING, RADIUS, FONT, FONT_WEIGHT } from "@/lib/ui/tokens";
import type {
  GovernanceActionState,
  PlatformTenantDetail,
} from "@/lib/platform-admin/types";
import { MappingDot, RunStatusChip, TenantStatusChip, ToolBadge } from "./chips";

const mono: React.CSSProperties = {
  fontFamily: "var(--font-mono, ui-monospace, monospace)",
  fontSize: FONT.xs,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.sm }}>
      <div style={{ fontSize: FONT.nano, fontWeight: FONT_WEIGHT.medium, color: "var(--ct-text-faint)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function TenantDrawer({
  ownerId,
  governanceActions,
  onClose,
}: {
  ownerId: string;
  governanceActions: GovernanceActionState[];
  onClose: () => void;
}) {
  // État initialisé en "loading" : le composant est remonté via key={ownerId}
  // par le parent à chaque sélection, donc l'effet n'a pas à resetter l'état
  // de façon synchrone (évite les cascading renders).
  const [detail, setDetail] = useState<PlatformTenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/platform/tenants/${ownerId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ detail: PlatformTenantDetail }>;
      })
      .then((d) => {
        if (alive) setDetail(d.detail);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Échec du chargement");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ownerId]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "var(--ct-overlay-dark-strong)", zIndex: 40 }}
      />
      {/* Panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(560px, 94vw)",
          background: "var(--ct-bg-deep)",
          borderLeft: "1px solid var(--ct-border)",
          boxShadow: "var(--ct-shadow-depth)",
          zIndex: 41,
          overflowY: "auto",
          padding: SPACING.xl,
          display: "flex",
          flexDirection: "column",
          gap: SPACING.xl,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: FONT.lg, fontWeight: FONT_WEIGHT.medium, color: "var(--ct-text-strong)" }}>
              {detail?.label ?? "Tenant"}
            </div>
            <div style={{ ...mono, color: "var(--ct-text-faint)" }}>{ownerId}</div>
          </div>
          <button type="button" className="ct-seg-btn" onClick={onClose} style={{ fontSize: FONT.xs }}>
            Fermer
          </button>
        </div>

        {loading && <div style={{ color: "var(--ct-text-faint)", fontSize: FONT.sm }}>Chargement…</div>}
        {error && (
          <div style={{ color: "var(--ct-alert-error-text)", background: "var(--ct-alert-error-bg)", border: "1px solid var(--ct-alert-error-border)", padding: SPACING.md, borderRadius: RADIUS.sm, fontSize: FONT.sm }}>
            {error}
          </div>
        )}

        {detail && (
          <>
            <Section title="Identité">
              <div style={{ display: "flex", gap: SPACING.md, alignItems: "center", flexWrap: "wrap" }}>
                <TenantStatusChip status={detail.status} />
                {detail.tenantIds.map((id) => (
                  <span key={id} style={{ ...mono, color: "var(--ct-text-muted)", padding: `2px ${SPACING.sm}px`, border: "1px solid var(--ct-border-soft)", borderRadius: RADIUS.full }}>
                    {id}
                  </span>
                ))}
                {detail.emailMasked && <span style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>{detail.emailMasked}</span>}
              </div>
            </Section>

            <Section title="Permissions outils">
              <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING.md }}>
                <ToolBadge name="composio" status={detail.tools.composio} />
                <ToolBadge name="telegram" status={detail.tools.telegram} />
                <ToolBadge name="vault" status={detail.tools.vault} />
                <ToolBadge name="chief" status={detail.tools.chief} />
                <ToolBadge name="architect" status={detail.tools.architect} />
              </div>
            </Section>

            <Section title="Mappings externes (présence)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING.lg }}>
                <MappingDot presence={detail.mappings.composioEntity} label="Composio entity" />
                <MappingDot presence={detail.mappings.telegramChat} label="Telegram chat" />
                <MappingDot presence={detail.mappings.vaultNamespace} label="Vault namespace" />
                <MappingDot presence={detail.mappings.schedulerOwner} label="Scheduler owner" />
              </div>
            </Section>

            <Section title="Quota de runs">
              {detail.quota.notConfigured ? (
                <div style={{ fontSize: FONT.sm, color: "var(--ct-text-faint)", padding: SPACING.md, border: "1px dashed var(--ct-border-soft)", borderRadius: RADIUS.sm }}>
                  Non configuré — aucune table de quotas durable. Requiert une foundation
                  de gouvernance avant toute allocation.
                </div>
              ) : (
                <div style={{ fontSize: FONT.md }}>
                  {detail.quota.used} / {detail.quota.limit ?? "∞"} ({detail.quota.period})
                </div>
              )}
            </Section>

            <Section title={`Incidents — ${detail.incidents.length}`}>
              {detail.incidents.length === 0 ? (
                <div style={{ fontSize: FONT.sm, color: "var(--ct-text-faint)" }}>Aucun incident dérivé.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xxs }}>
                  {detail.incidents.map((i, idx) => (
                    <div key={idx} style={{ display: "flex", gap: SPACING.sm, alignItems: "baseline", fontSize: FONT.xs }}>
                      <span style={{ color: i.severity === "critical" ? "var(--ct-status-failed)" : i.severity === "warning" ? "var(--ct-status-paused)" : "var(--ct-text-faint)" }}>●</span>
                      <span style={{ ...mono, color: "var(--ct-text-muted)" }}>{i.kind}</span>
                      <span style={{ color: "var(--ct-text-body)" }}>{i.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Swarms — ${detail.swarms.length}`}>
              {detail.swarms.length === 0 ? (
                <div style={{ fontSize: FONT.sm, color: "var(--ct-text-faint)" }}>Aucun swarm.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {detail.swarms.slice(0, 20).map((s) => (
                    <div key={s.id} style={{ display: "flex", gap: SPACING.sm, alignItems: "center", fontSize: FONT.xs }}>
                      <span style={{ color: s.isActive ? "var(--ct-state-ok)" : "var(--ct-text-faint)" }}>●</span>
                      <span style={{ color: "var(--ct-text-body)" }}>{s.label}</span>
                      {s.isTemplate && <span style={{ color: "var(--ct-accent)", fontSize: FONT.nano }}>template</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Runs récents — ${detail.runs.length}`}>
              {detail.runs.length === 0 ? (
                <div style={{ fontSize: FONT.sm, color: "var(--ct-text-faint)" }}>Aucun run.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xxs }}>
                  {detail.runs.slice(0, 25).map((r, idx) => (
                    <div key={`${r.runId}-${idx}`} style={{ display: "flex", gap: SPACING.sm, alignItems: "center", fontSize: FONT.xs, padding: `${SPACING.xxs}px 0`, borderBottom: "1px solid var(--ct-border-soft)" }}>
                      <span style={{ ...mono, color: "var(--ct-text-faint)", minWidth: 70 }}>{r.runId}</span>
                      <RunStatusChip status={r.status} />
                      <span style={{ color: "var(--ct-text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.swarmLabel ?? r.source}
                      </span>
                      {r.errorClass && <span style={{ color: "var(--ct-status-failed)" }}>{r.errorClass}</span>}
                      {r.traceId && <span style={{ ...mono, color: "var(--ct-text-faint)" }} title="trace id">{r.traceId}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Approvals / HITL — ${detail.approvals.length}`}>
              {detail.approvals.length === 0 ? (
                <div style={{ fontSize: FONT.sm, color: "var(--ct-text-faint)" }}>Aucune décision HITL.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {detail.approvals.slice(0, 20).map((a, idx) => (
                    <div key={`${a.decisionId}-${idx}`} style={{ display: "flex", gap: SPACING.sm, fontSize: FONT.xs }}>
                      <span style={{ ...mono, color: "var(--ct-text-faint)" }}>{a.decisionId}</span>
                      <span style={{ color: "var(--ct-text-muted)" }}>{a.source}</span>
                      <span style={{ color: a.status === "pending" ? "var(--ct-status-paused)" : "var(--ct-text-body)" }}>{a.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Actions opérateur">
              <div style={{ display: "flex", flexDirection: "column", gap: SPACING.sm }}>
                {governanceActions.map((a) => (
                  <div key={a.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button
                      type="button"
                      className="ct-seg-btn"
                      disabled={!a.enabled}
                      title={a.disabledReason}
                      style={{ fontSize: FONT.xs, opacity: a.enabled ? 1 : 0.55, cursor: a.enabled ? "pointer" : "not-allowed", textAlign: "left" }}
                    >
                      {a.label}
                    </button>
                    {!a.enabled && a.disabledReason && (
                      <span style={{ fontSize: FONT.nano, color: "var(--ct-text-faint)" }}>{a.disabledReason}</span>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Notes opérateur">
              {detail.operatorNotes.length === 0 ? (
                <div style={{ fontSize: FONT.sm, color: "var(--ct-text-faint)" }}>
                  Aucune note. La persistance des notes requiert une table durable
                  (operator_notes) — non disponible en V1.
                </div>
              ) : (
                detail.operatorNotes.map((n, idx) => (
                  <div key={idx} style={{ fontSize: FONT.xs, color: "var(--ct-text-body)" }}>
                    <span style={{ color: "var(--ct-text-faint)" }}>{n.at}</span> {n.text}
                  </div>
                ))
              )}
            </Section>
          </>
        )}
      </aside>
    </>
  );
}
