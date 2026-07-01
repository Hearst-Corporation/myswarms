"use client";

/**
 * Platform Admin — drawer de détail tenant.
 *
 * Charge le détail à la demande (GET /api/admin/platform/tenants/[ownerId]).
 * Sections : identité, permissions, mappings (presence-only), quota,
 * incidents, runs timeline, approvals, governance actions (disabled).
 * Aucun secret, aucun contenu privé brut.
 */

import { useEffect, useState, type ReactNode } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button, Alert, Spinner } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import type {
  GovernanceActionState,
  PlatformTenantDetail,
} from "@/lib/platform-admin/types";
import { MappingDot, RunStatusChip, TenantStatusChip, ToolBadge } from "./chips";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-content-faint">
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
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      {/* Panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-[41] flex h-screen w-[min(560px,94vw)] flex-col gap-6 overflow-y-auto",
          "border-l border-line-strong bg-surface p-6 shadow-2xl",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-content-strong">
              {detail?.label ?? "Tenant"}
            </div>
            <div className="break-all font-mono text-xs text-content-faint">{ownerId}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-md p-1 text-content-muted hover:bg-surface-2 hover:text-content"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-content-faint">
            <Spinner /> Chargement…
          </div>
        )}
        {error && (
          <Alert tone="error" role="alert">{error}</Alert>
        )}

        {detail && (
          <>
            <Section title="Identité">
              <div className="flex flex-wrap items-center gap-3">
                <TenantStatusChip status={detail.status} />
                {detail.tenantIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-full border border-line px-2 py-0.5 font-mono text-xs text-content-muted"
                  >
                    {id}
                  </span>
                ))}
                {detail.emailMasked && (
                  <span className="text-xs text-content-faint">{detail.emailMasked}</span>
                )}
              </div>
            </Section>

            <Section title="Permissions outils">
              <div className="flex flex-wrap gap-3">
                <ToolBadge name="composio" status={detail.tools.composio} />
                <ToolBadge name="telegram" status={detail.tools.telegram} />
                <ToolBadge name="vault" status={detail.tools.vault} />
                <ToolBadge name="chief" status={detail.tools.chief} />
                <ToolBadge name="architect" status={detail.tools.architect} />
              </div>
            </Section>

            <Section title="Mappings externes (présence)">
              <div className="flex flex-wrap gap-4">
                <MappingDot presence={detail.mappings.composioEntity} label="Composio entity" />
                <MappingDot presence={detail.mappings.telegramChat} label="Telegram chat" />
                <MappingDot presence={detail.mappings.vaultNamespace} label="Vault namespace" />
                <MappingDot presence={detail.mappings.schedulerOwner} label="Scheduler owner" />
              </div>
            </Section>

            <Section title="Quota de runs">
              {detail.quota.notConfigured ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-line px-3 py-2 text-sm text-content-faint">
                  Non configuré — aucune table de quotas durable. Requiert une foundation
                  de gouvernance avant toute allocation.
                </div>
              ) : (
                <div className="text-sm text-content">
                  {detail.quota.used} / {detail.quota.limit ?? "∞"} ({detail.quota.period})
                </div>
              )}
            </Section>

            <Section title={`Incidents — ${detail.incidents.length}`}>
              {detail.incidents.length === 0 ? (
                <div className="text-sm text-content-faint">Aucun incident dérivé.</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {detail.incidents.map((i, idx) => (
                    <div key={idx} className="flex items-baseline gap-2 text-xs">
                      <span
                        className={cn(
                          i.severity === "critical"
                            ? "text-danger"
                            : i.severity === "warning"
                              ? "text-[var(--color-warn)]"
                              : "text-content-faint",
                        )}
                      >
                        ●
                      </span>
                      <span className="font-mono text-content-muted">{i.kind}</span>
                      <span className="text-content">{i.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Swarms — ${detail.swarms.length}`}>
              {detail.swarms.length === 0 ? (
                <div className="text-sm text-content-faint">Aucun swarm.</div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {detail.swarms.slice(0, 20).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <span className={s.isActive ? "text-[var(--color-ok)]" : "text-content-faint"}>●</span>
                      <span className="text-content">{s.label}</span>
                      {s.isTemplate && <span className="text-[10px] text-accent">template</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Runs récents — ${detail.runs.length}`}>
              {detail.runs.length === 0 ? (
                <div className="text-sm text-content-faint">Aucun run.</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {detail.runs.slice(0, 25).map((r, idx) => (
                    <div
                      key={`${r.runId}-${idx}`}
                      className="flex items-center gap-2 border-b border-line py-1 text-xs"
                    >
                      <span className="min-w-[70px] font-mono text-content-faint">{r.runId}</span>
                      <RunStatusChip status={r.status} />
                      <span className="flex-1 truncate text-content-muted">
                        {r.swarmLabel ?? r.source}
                      </span>
                      {r.errorClass && <span className="text-danger">{r.errorClass}</span>}
                      {r.traceId && (
                        <span className="font-mono text-content-faint" title="trace id">{r.traceId}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title={`Approvals / HITL — ${detail.approvals.length}`}>
              {detail.approvals.length === 0 ? (
                <div className="text-sm text-content-faint">Aucune décision HITL.</div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {detail.approvals.slice(0, 20).map((a, idx) => (
                    <div key={`${a.decisionId}-${idx}`} className="flex gap-2 text-xs">
                      <span className="font-mono text-content-faint">{a.decisionId}</span>
                      <span className="text-content-muted">{a.source}</span>
                      <span className={a.status === "pending" ? "text-[var(--color-warn)]" : "text-content"}>
                        {a.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Actions opérateur">
              <div className="flex flex-col gap-2">
                {governanceActions.map((a) => (
                  <div key={a.key} className="flex flex-col gap-0.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!a.enabled}
                      title={a.disabledReason}
                      className="justify-start"
                    >
                      {a.label}
                    </Button>
                    {!a.enabled && a.disabledReason && (
                      <span className="text-[10px] text-content-faint">{a.disabledReason}</span>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Notes opérateur">
              {detail.operatorNotes.length === 0 ? (
                <div className="text-sm text-content-faint">
                  Aucune note. La persistance des notes requiert une table durable
                  (operator_notes) — non disponible en V1.
                </div>
              ) : (
                detail.operatorNotes.map((n, idx) => (
                  <div key={idx} className="text-xs text-content">
                    <span className="text-content-faint">{n.at}</span> {n.text}
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
