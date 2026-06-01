import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import {
  FONT,
  FONT_WEIGHT,
  LETTER_SPACING,
  SPACING,
} from "@/lib/ui/tokens";
import type { SwarmListItem, SwarmRunSummary } from "@/lib/forms/swarmSchemas";

export const metadata = { title: "MySwarms · Dashboard" };
export const dynamic = "force-dynamic";

const thStyle: React.CSSProperties = {
  padding: `${SPACING.md}px ${SPACING.lx}px`,
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.bold,
  letterSpacing: LETTER_SPACING.wide,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
  textAlign: "left",
};

function DurationLabel({
  startedAt,
  finishedAt,
}: {
  startedAt: string | null | undefined;
  finishedAt: string | null | undefined;
}) {
  if (!startedAt) return <span style={{ color: "var(--ct-text-faint)" }}>—</span>;
  const end = finishedAt ? new Date(finishedAt) : null;
  if (!end) return <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.sm }}>en cours</span>;
  const ms = end.getTime() - new Date(startedAt).getTime();
  if (ms < 0) return <span style={{ color: "var(--ct-text-faint)" }}>—</span>;
  const s = Math.round(ms / 1000);
  if (s < 60) return <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.sm }}>{s}s</span>;
  return <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.sm }}>{Math.round(s / 60)}m</span>;
}

function TokensLabel({ tokensIn, tokensOut }: { tokensIn: number; tokensOut: number }) {
  const total = tokensIn + tokensOut;
  if (total === 0) return <span style={{ color: "var(--ct-text-faint)" }}>—</span>;
  return (
    <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.sm, fontFamily: "monospace" }}>
      {total.toLocaleString()}
    </span>
  );
}

export default async function Home() {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch {
    redirect("/login");
  }

  let swarms: SwarmListItem[] = [];
  try {
    swarms = await swarmsClient.list(ownerId);
  } catch {
    // silencieux
  }
  const userSwarms = swarms.filter((s) => !s.is_template && s.is_active !== false);

  const recentRuns: Array<SwarmRunSummary & { swarmName: string; swarmId: string }> = [];
  await Promise.allSettled(
    userSwarms.slice(0, 5).map(async (s) => {
      try {
        const runs = await swarmsClient.listRuns(s.id, 5, ownerId);
        for (const r of runs) recentRuns.push({ ...r, swarmName: s.name, swarmId: s.id });
      } catch {
        // silencieux
      }
    }),
  );
  recentRuns.sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
  const top10 = recentRuns.slice(0, 10);

  const activeSwarmCount = userSwarms.length;
  const completedCount = top10.filter((r) => r.status === "completed").length;
  const failedCount = top10.filter((r) => r.status === "failed").length;
  const total = completedCount + failedCount;
  const successRate = total > 0 ? Math.round((completedCount / total) * 100) : null;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: SPACING.xxl,
        }}
      >
        <div>
          <span className="ct-eyebrow">Cockpit · MySwarms</span>
          <h1 className="ct-title">Orchestration Dashboard</h1>
          <p className="ct-sub">{today}</p>
        </div>
        <Link
          href="/swarms/new"
          className="ct-seg-btn primary"
          style={{ fontSize: FONT.sm, whiteSpace: "nowrap" }}
        >
          + Nouveau swarm
        </Link>
      </div>

      {/* KPIs */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: SPACING.lg,
          marginBottom: SPACING.xxl,
        }}
      >
        <div className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
          <div
            style={{
              fontSize: FONT.xs,
              fontWeight: FONT_WEIGHT.bold,
              letterSpacing: LETTER_SPACING.wide,
              textTransform: "uppercase",
              color: "var(--ct-text-muted)",
              marginBottom: SPACING.sm,
            }}
          >
            Swarms actifs
          </div>
          <div
            style={{
              fontSize: FONT.xxl,
              fontWeight: FONT_WEIGHT.extrabold,
              color: "var(--ct-accent-strong)",
              lineHeight: 1,
            }}
          >
            {activeSwarmCount}
          </div>
          <div style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)", marginTop: SPACING.xs }}>
            non-templates · actifs
          </div>
        </div>

        <div className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
          <div
            style={{
              fontSize: FONT.xs,
              fontWeight: FONT_WEIGHT.bold,
              letterSpacing: LETTER_SPACING.wide,
              textTransform: "uppercase",
              color: "var(--ct-text-muted)",
              marginBottom: SPACING.sm,
            }}
          >
            Runs complétés
          </div>
          <div
            style={{
              fontSize: FONT.xxl,
              fontWeight: FONT_WEIGHT.extrabold,
              color:
                completedCount > 0
                  ? "var(--ct-status-completed)"
                  : "var(--ct-text-strong)",
              lineHeight: 1,
            }}
          >
            {completedCount}
          </div>
          <div style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)", marginTop: SPACING.xs }}>
            sur les 10 derniers runs
          </div>
        </div>

        <div className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
          <div
            style={{
              fontSize: FONT.xs,
              fontWeight: FONT_WEIGHT.bold,
              letterSpacing: LETTER_SPACING.wide,
              textTransform: "uppercase",
              color: "var(--ct-text-muted)",
              marginBottom: SPACING.sm,
            }}
          >
            Taux de succès
          </div>
          <div
            style={{
              fontSize: FONT.xxl,
              fontWeight: FONT_WEIGHT.extrabold,
              color:
                successRate === null
                  ? "var(--ct-text-faint)"
                  : successRate >= 80
                  ? "var(--ct-status-completed)"
                  : successRate >= 50
                  ? "var(--ct-status-paused)"
                  : "var(--ct-alert-error-text)",
              lineHeight: 1,
            }}
          >
            {successRate !== null ? `${successRate}%` : "—"}
          </div>
          <div style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)", marginTop: SPACING.xs }}>
            {total > 0 ? `${completedCount}/${total} runs` : "aucun run récent"}
          </div>
        </div>
      </div>

      {/* Table des derniers runs */}
      <div style={{ marginBottom: SPACING.xxl }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: SPACING.md,
          }}
        >
          <span
            style={{
              fontSize: FONT.xs,
              fontWeight: FONT_WEIGHT.bold,
              letterSpacing: LETTER_SPACING.wide,
              textTransform: "uppercase",
              color: "var(--ct-text-muted)",
            }}
          >
            Derniers runs — {top10.length}
          </span>
          <Link href="/swarms" className="ct-link" style={{ fontSize: FONT.sm }}>
            Voir tous les swarms →
          </Link>
        </div>

        <div className="ct-card" style={{ padding: 0, overflow: "hidden" }}>
          {top10.length === 0 ? (
            <div
              className="ct-placeholder"
              style={{ padding: `${SPACING.xl}px ${SPACING.lx}px` }}
            >
              Aucun run récent.{" "}
              <Link href="/swarms/new" className="ct-link">
                Créer un swarm →
              </Link>
            </div>
          ) : (
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.base }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ct-border)" }}>
                  <th style={thStyle}>Swarm</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Démarré</th>
                  <th style={thStyle}>Durée</th>
                  <th style={thStyle}>Tokens</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {top10.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--ct-border-soft)" }}>
                    <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px` }}>
                      <Link
                        href={`/swarms/${r.swarmId}`}
                        className="ct-link"
                        style={{ fontWeight: FONT_WEIGHT.semibold, fontSize: FONT.sm }}
                      >
                        {r.swarmName}
                      </Link>
                    </td>
                    <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px` }}>
                      <StatusBadge status={r.status} />
                    </td>
                    <td
                      style={{
                        padding: `${SPACING.s}px ${SPACING.lx}px`,
                        color: "var(--ct-text-muted)",
                        fontSize: FONT.sm,
                      }}
                    >
                      {formatDate(r.started_at)}
                    </td>
                    <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px` }}>
                      <DurationLabel
                        startedAt={r.started_at}
                        finishedAt={r.finished_at}
                      />
                    </td>
                    <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px` }}>
                      <TokensLabel
                        tokensIn={r.total_tokens_in ?? 0}
                        tokensOut={r.total_tokens_out ?? 0}
                      />
                    </td>
                    <td
                      style={{
                        padding: `${SPACING.s}px ${SPACING.lx}px`,
                        textAlign: "right",
                      }}
                    >
                      <Link
                        href={`/swarms/${r.swarmId}/runs/${r.id}`}
                        style={{ color: "var(--ct-accent-strong)", fontSize: FONT.sm }}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
