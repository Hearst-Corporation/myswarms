"use client";

import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Table, THead, TBody, TR, TH, TD, Badge } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

export interface RunRow {
  id: string;
  swarm_id: string;
  swarm_name: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at?: string | null;
  total_tokens_in: number;
  total_tokens_out: number;
}

interface StepRow {
  agent_name: string | null;
  status: string;
  tokens_in: number;
  tokens_out: number;
  latency_ms: number | null;
  finished_at: string | null;
}

interface RunDetail {
  id: string;
  status: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  total_tokens_in: number;
  total_tokens_out: number;
  error_text: string | null;
  steps: StepRow[];
}

interface Props {
  initialRuns: RunRow[];
  initialLive: RunRow[];
  swarmMap: Record<string, string>;
  initialEngine: "ok" | "unreachable";
}

function triggerLabel(t: string): { label: string; className: string } {
  if (t === "on_demand") return { label: "Manuel", className: "text-content-muted" };
  if (t === "webhook") return { label: "Webhook", className: "text-accent" };
  return { label: "Planifié", className: "text-[var(--color-warn)]" };
}

function formatDuration(started: string, finished: string | null | undefined): string {
  if (!finished) return "en cours";
  const ms = new Date(finished).getTime() - new Date(started).getTime();
  if (ms < 0) return "—";
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function EngineDot({ status }: { status: "ok" | "unreachable" }) {
  const ok = status === "ok";
  return (
    <span
      className={cn(
        "inline-block size-[7px] shrink-0 rounded-full",
        ok ? "bg-[var(--color-ok)]" : "bg-danger",
      )}
    />
  );
}

function StepStatusDot({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-[var(--color-ok)]"
      : status === "running"
        ? "bg-[var(--color-running)]"
        : status === "failed"
          ? "bg-danger"
          : "bg-content-muted";
  return <span className={cn("mr-1 inline-block size-1.5 shrink-0 rounded-full", color)} />;
}

function DetailPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/activity/run/${runId}`)
      .then((r) => r.json())
      .then((data: RunDetail & { error?: string }) => {
        if (!cancelled) {
          if (data.error) {
            setError(data.error);
          } else {
            setDetail(data);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Erreur de chargement");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [runId]);

  return (
    <tr>
      <td colSpan={6} className="border-b border-line bg-surface-2 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-content">Détail du run</span>
          <button
            onClick={onClose}
            aria-label="Fermer le détail"
            className="rounded-md p-1 text-content-muted hover:bg-surface-3 hover:text-content"
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>

        {loading && <span className="text-sm text-content-muted">Chargement…</span>}

        {error && <span className="text-sm text-danger">{error}</span>}

        {!loading && !error && detail && (
          <>
            {detail.error_text && (
              <div className="mb-2 rounded-[var(--radius-md)] border border-[color-mix(in_oklab,var(--color-danger)_25%,transparent)] bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] px-3 py-2 text-sm text-danger">
                {detail.error_text}
              </div>
            )}

            {detail.steps.length === 0 ? (
              <span className="text-sm text-content-muted">Aucune étape enregistrée.</span>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Agent</TH>
                    <TH>Statut</TH>
                    <TH>Tokens</TH>
                    <TH>Latence</TH>
                    <TH>Terminé</TH>
                  </TR>
                </THead>
                <TBody>
                  {detail.steps.map((step, i) => (
                    <TR key={i}>
                      <TD>
                        <span className="inline-flex items-center">
                          <StepStatusDot status={step.status} />
                          {step.agent_name ?? "—"}
                        </span>
                      </TD>
                      <TD>
                        <StatusBadge status={step.status} />
                      </TD>
                      <TD className="tabular-nums text-content-muted">
                        {(step.tokens_in + step.tokens_out).toLocaleString("fr-FR")}
                      </TD>
                      <TD className="text-content-muted">
                        {step.latency_ms != null ? `${step.latency_ms}ms` : "—"}
                      </TD>
                      <TD className="text-content-muted">
                        {formatDate(step.finished_at)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

function RunsTable({
  runs,
  expandedRunId,
  onToggle,
  emptyLabel,
}: {
  runs: RunRow[];
  expandedRunId: string | null;
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  if (runs.length === 0) {
    return <p className="py-4 text-sm text-content-muted">{emptyLabel}</p>;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Swarm</TH>
          <TH>Trigger</TH>
          <TH>Statut</TH>
          <TH>Tokens</TH>
          <TH>Durée</TH>
          <TH>Démarré</TH>
        </TR>
      </THead>
      <TBody>
        {runs.map((run) => {
          const trig = triggerLabel(run.trigger);
          const isExpanded = expandedRunId === run.id;
          return (
            <>
              <TR
                key={run.id}
                onClick={() => onToggle(run.id)}
                className={cn("cursor-pointer", isExpanded && "bg-surface-2 hover:bg-surface-2")}
              >
                <TD className="font-medium text-content-strong">{run.swarm_name}</TD>
                <TD>
                  <span className={cn("text-xs", trig.className)}>{trig.label}</span>
                </TD>
                <TD>
                  <StatusBadge status={run.status} />
                </TD>
                <TD className="tabular-nums text-content-muted">
                  {(run.total_tokens_in + run.total_tokens_out).toLocaleString("fr-FR")}
                </TD>
                <TD className="text-content-muted">
                  {formatDuration(run.started_at, run.finished_at)}
                </TD>
                <TD className="text-content-muted">{formatDate(run.started_at)}</TD>
              </TR>
              {isExpanded && (
                <DetailPanel
                  key={`detail-${run.id}`}
                  runId={run.id}
                  onClose={() => onToggle(run.id)}
                />
              )}
            </>
          );
        })}
      </TBody>
    </Table>
  );
}

export function ActivityFeed({
  initialRuns,
  initialLive,
  initialEngine,
}: Props) {
  const [liveRuns, setLiveRuns] = useState<RunRow[]>(initialLive);
  const [engine, setEngine] = useState<"ok" | "unreachable">(initialEngine);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/activity/live");
        if (!res.ok) return;
        const data = (await res.json()) as { runs: RunRow[]; engine: "ok" | "unreachable" };
        setLiveRuns(data.runs);
        setEngine(data.engine);
        setLastUpdated(new Date());
      } catch {
        // silent — stale data is fine
      }
    };

    // Intervalle env-driven (défaut 8s vs 3s avant) — réduit la charge du poll
    // (cascade engine→DB à chaque tick, cf audit perf). Le guard visibilité
    // ci-dessus coupe déjà le poll hors focus.
    const pollMs = Number(process.env.NEXT_PUBLIC_ACTIVITY_POLL_MS ?? "8000");
    intervalRef.current = setInterval(poll, pollMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedRunId((prev) => (prev === id ? null : id));
  };

  const engineOk = engine === "ok";

  return (
    <div className="flex flex-col gap-8">
      {/* Header: engine status + last updated */}
      <div className="flex items-center gap-2 text-sm text-content-muted">
        <EngineDot status={engine} />
        <span>
          Engine ·{" "}
          <span className={engineOk ? "text-[var(--color-ok)]" : "text-danger"}>
            {engineOk ? "ok" : "hors ligne"}
          </span>
        </span>
        <span className="ml-auto text-xs text-content-muted">
          Mis à jour {formatDate(lastUpdated.toISOString())}
        </span>
      </div>

      {/* Live section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-[var(--color-running)]"
            aria-label="Live"
          />
          <span className="text-sm font-semibold text-content">En cours</span>
          <Badge tone="neutral">{liveRuns.length}</Badge>
        </div>

        <RunsTable
          runs={liveRuns}
          expandedRunId={expandedRunId}
          onToggle={toggleExpand}
          emptyLabel="Aucun run actif."
        />
      </div>

      {/* Recent section */}
      <div className="flex flex-col gap-3">
        <span className="text-sm font-semibold text-content">Récents</span>

        <RunsTable
          runs={initialRuns}
          expandedRunId={expandedRunId}
          onToggle={toggleExpand}
          emptyLabel="Aucun run récent."
        />
      </div>
    </div>
  );
}
