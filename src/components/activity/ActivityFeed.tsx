"use client";

import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";
import { thStyle, tdStyle } from "@/lib/ui/tableStyles";

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

function triggerLabel(t: string): { label: string; color: string } {
  if (t === "on_demand") return { label: "Manuel", color: "var(--ct-text-muted)" };
  if (t === "webhook") return { label: "Webhook", color: "var(--ct-accent-strong)" };
  return { label: "Planifié", color: "#f59e0b" };
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
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: RADIUS.full,
        background: ok ? "var(--ct-status-completed)" : "var(--ct-status-failed)",
        flexShrink: 0,
      }}
    />
  );
}

function PulseDot() {
  return (
    <>
      <style>{`
        @keyframes ct-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }
        .ct-pulse-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: var(--ct-status-running);
          animation: ct-pulse 1.8s ease-in-out infinite;
          flex-shrink: 0;
        }
      `}</style>
      <span className="ct-pulse-dot" aria-label="Live" />
    </>
  );
}

function StepStatusDot({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "var(--ct-status-completed)"
      : status === "running"
        ? "var(--ct-status-running)"
        : status === "failed"
          ? "var(--ct-status-failed)"
          : "var(--ct-text-muted)";
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: RADIUS.full,
        background: color,
        flexShrink: 0,
        marginRight: SPACING.xxs,
      }}
    />
  );
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
      <td
        colSpan={6}
        style={{
          ...tdStyle,
          padding: SPACING.lg,
          background: "var(--ct-surface-2)",
          borderBottom: "1px solid var(--ct-border)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.sm }}>
          <span style={{ fontSize: FONT.sm, fontWeight: FONT_WEIGHT.semibold, color: "var(--ct-text-body)" }}>
            Détail du run
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--ct-text-muted)",
              fontSize: FONT.md,
              padding: 0,
              lineHeight: 1,
            }}
            aria-label="Fermer le détail"
          >
            ✕
          </button>
        </div>

        {loading && (
          <span style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)" }}>Chargement…</span>
        )}

        {error && (
          <span style={{ fontSize: FONT.sm, color: "var(--ct-status-failed)" }}>{error}</span>
        )}

        {!loading && !error && detail && (
          <>
            {detail.error_text && (
              <div
                style={{
                  fontSize: FONT.sm,
                  color: "var(--ct-status-failed)",
                  marginBottom: SPACING.sm,
                  padding: `${SPACING.sm}px ${SPACING.md}px`,
                  background: "var(--ct-status-failed-bg)",
                  borderRadius: RADIUS.sm,
                  border: "1px solid var(--ct-status-failed-border)",
                }}
              >
                {detail.error_text}
              </div>
            )}

            {detail.steps.length === 0 ? (
              <span style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)" }}>Aucune étape enregistrée.</span>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Agent</th>
                    <th style={thStyle}>Statut</th>
                    <th style={thStyle}>Tokens</th>
                    <th style={thStyle}>Latence</th>
                    <th style={thStyle}>Terminé</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.steps.map((step, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: SPACING.xxs }}>
                          <StepStatusDot status={step.status} />
                          {step.agent_name ?? "—"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={step.status} />
                      </td>
                      <td style={{ ...tdStyle, color: "var(--ct-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                        {(step.tokens_in + step.tokens_out).toLocaleString("fr-FR")}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                        {step.latency_ms != null ? `${step.latency_ms}ms` : "—"}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                        {formatDate(step.finished_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    return (
      <p style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)", padding: `${SPACING.lg}px 0` }}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Swarm</th>
            <th style={thStyle}>Trigger</th>
            <th style={thStyle}>Statut</th>
            <th style={thStyle}>Tokens</th>
            <th style={thStyle}>Durée</th>
            <th style={thStyle}>Démarré</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const trig = triggerLabel(run.trigger);
            const isExpanded = expandedRunId === run.id;
            return (
              <>
                <tr
                  key={run.id}
                  onClick={() => onToggle(run.id)}
                  style={{
                    cursor: "pointer",
                    background: isExpanded ? "var(--ct-surface-2)" : undefined,
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = "var(--ct-surface-hover, var(--ct-surface-2))";
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) (e.currentTarget as HTMLTableRowElement).style.background = "";
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: FONT_WEIGHT.medium }}>
                    {run.swarm_name}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: FONT.xxs, color: trig.color }}>
                      {trig.label}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={run.status} />
                  </td>
                  <td style={{ ...tdStyle, color: "var(--ct-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {(run.total_tokens_in + run.total_tokens_out).toLocaleString("fr-FR")}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                    {formatDuration(run.started_at, run.finished_at)}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                    {formatDate(run.started_at)}
                  </td>
                </tr>
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
        </tbody>
      </table>
    </div>
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
    <div>
      {/* Header: engine status + last updated */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: SPACING.sm,
          marginBottom: SPACING.xl,
          fontSize: FONT.sm,
          color: "var(--ct-text-muted)",
        }}
      >
        <EngineDot status={engine} />
        <span>
          Engine ·{" "}
          <span style={{ color: engineOk ? "var(--ct-status-completed)" : "var(--ct-status-failed)" }}>
            {engineOk ? "ok" : "hors ligne"}
          </span>
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: FONT.xxs,
            color: "var(--ct-text-muted)",
          }}
        >
          Mis à jour {formatDate(lastUpdated.toISOString())}
        </span>
      </div>

      {/* Live section */}
      <div style={{ marginBottom: SPACING.xxl }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACING.sm,
            marginBottom: SPACING.md,
          }}
        >
          <PulseDot />
          <span style={{ fontSize: FONT.md, fontWeight: FONT_WEIGHT.semibold, color: "var(--ct-text-body)" }}>
            En cours
          </span>
          <span
            style={{
              fontSize: FONT.xxs,
              fontWeight: FONT_WEIGHT.medium,
              background: "var(--ct-surface-2)",
              color: "var(--ct-text-muted)",
              borderRadius: RADIUS.full,
              padding: `${SPACING.hair}px ${SPACING.sm}px`,
              border: "1px solid var(--ct-border)",
            }}
          >
            {liveRuns.length}
          </span>
        </div>

        <RunsTable
          runs={liveRuns}
          expandedRunId={expandedRunId}
          onToggle={toggleExpand}
          emptyLabel="Aucun run actif."
        />
      </div>

      {/* Recent section */}
      <div>
        <div style={{ marginBottom: SPACING.md }}>
          <span style={{ fontSize: FONT.md, fontWeight: FONT_WEIGHT.semibold, color: "var(--ct-text-body)" }}>
            Récents
          </span>
        </div>

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
