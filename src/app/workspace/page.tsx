import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { swarmsClient } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmListItem, SwarmRunSummary } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING, COLOR } from "@/lib/ui/tokens";
import { makeTableStyles } from "@/lib/ui/tableStyles";
import { Chevron } from "@/components/ui/Chevron";

export const metadata = { title: "Workspace — MySwarms" };
export const dynamic = "force-dynamic";

// ── Helpers d'affichage ───────────────────────────────────────────────────────

function OwnerBadge({ email, id }: { email: string | null; id: string }) {
  return (
    <div
      className="ct-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: SPACING.lg,
        padding: `${SPACING.md}px ${SPACING.lx}px`,
        marginBottom: SPACING.xl,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: RADIUS.full,
          background: "var(--ct-accent-strong)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: FONT.md,
          fontWeight: FONT_WEIGHT.bold,
          color: COLOR.textStrong,
          flexShrink: 0,
        }}
      >
        {(email ?? "?").slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: FONT.md, fontWeight: FONT_WEIGHT.semibold, color: "var(--ct-text-strong)" }}>
          {email ?? "Authenticated user"}
        </div>
        <div style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", fontFamily: "monospace", marginTop: 2 }}>
          owner_id: {id}
        </div>
      </div>
      <div style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", letterSpacing: LETTER_SPACING.wide, textTransform: "uppercase" }}>
        Single workspace
      </div>
    </div>
  );
}

function SwarmRow({ s, variant }: { s: SwarmListItem; variant: "owned" | "template" }) {
  return (
    <tr style={{ borderBottom: "1px solid var(--ct-border-soft)" }}>
      <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px`, color: "var(--ct-text-body)" }}>
        <Link href={`/swarms/${s.id}`} className="ct-link" style={{ fontWeight: FONT_WEIGHT.semibold }}>
          {s.name}
        </Link>
        {variant === "template" && (
          <span
            style={{
              marginLeft: SPACING.sm,
              fontSize: FONT.xs,
              padding: `${SPACING.hair}px ${SPACING.xxs}px`,
              borderRadius: RADIUS.sm,
              background: "var(--ct-surface-3)",
              color: "var(--ct-text-muted)",
            }}
          >
            TEMPLATE
          </span>
        )}
      </td>
      <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px`, color: "var(--ct-text-muted)", fontSize: FONT.sm }}>
        {s.agents_count} agent{s.agents_count !== 1 ? "s" : ""}
      </td>
      <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px` }}>
        {s.last_run_status ? (
          <StatusBadge status={s.last_run_status} />
        ) : (
          <span style={{ color: "var(--ct-text-faint)", fontSize: FONT.sm }}>—</span>
        )}
      </td>
      <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px`, color: "var(--ct-text-muted)", fontSize: FONT.sm }}>
        {s.last_run_at ? formatDate(s.last_run_at) : "—"}
      </td>
      <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px`, textAlign: "right" }}>
        {variant === "owned" ? (
          <Link href={`/swarms/${s.id}/edit`} style={{ color: "var(--ct-accent-strong)", fontSize: FONT.sm }}>
            Edit
          </Link>
        ) : (
          <Link href={`/swarms/${s.id}`} style={{ color: "var(--ct-accent-strong)", fontSize: FONT.sm }}>
            View
          </Link>
        )}
      </td>
    </tr>
  );
}

// padY: SPACING.md(12), padX: SPACING.lx(20), no border (tr carries the border)
const { th: thStyle } = makeTableStyles({ padY: SPACING.md, padX: SPACING.lx, border: false });

function SwarmTable({ swarms, variant }: { swarms: SwarmListItem[]; variant: "owned" | "template" }) {
  if (swarms.length === 0) {
    return (
      <div className="ct-placeholder" style={{ padding: `${SPACING.xl}px ${SPACING.lx}px` }}>
        {variant === "owned"
          ? <>No swarm yet. <Link href="/swarms/new" className="ct-link">Create one →</Link></>
          : "No global template available."}
      </div>
    );
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.base }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--ct-border)" }}>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Agents</th>
          <th style={thStyle}>Last status</th>
          <th style={thStyle}>Last run</th>
          <th style={thStyle}></th>
        </tr>
      </thead>
      <tbody>
        {swarms.map((s) => <SwarmRow key={s.id} s={s} variant={variant} />)}
      </tbody>
    </table>
  );
}

interface RecentRun {
  run_id: string;
  swarm_id: string;
  swarm_name: string;
  status: string;
  started_at: string | null;
  total_cost_usd: number;
}

function RecentRunsTable({ runs }: { runs: RecentRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="ct-placeholder" style={{ padding: `${SPACING.xl}px ${SPACING.lx}px` }}>
        No run yet. Kickoff a swarm to get started.
      </div>
    );
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.base }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--ct-border)" }}>
          <th style={thStyle}>Run ID</th>
          <th style={thStyle}>Swarm</th>
          <th style={thStyle}>Status</th>
          <th style={thStyle}>Started</th>
          <th style={thStyle}>Cost</th>
          <th style={thStyle}></th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.run_id} style={{ borderBottom: "1px solid var(--ct-border-soft)" }}>
            <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px`, fontFamily: "monospace", fontSize: FONT.xs, color: "var(--ct-text-muted)" }}>
              {r.run_id.slice(0, 8)}
            </td>
            <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px` }}>
              <Link href={`/swarms/${r.swarm_id}`} className="ct-link" style={{ fontSize: FONT.sm }}>
                {r.swarm_name}
              </Link>
            </td>
            <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px` }}>
              <StatusBadge status={r.status} />
            </td>
            <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px`, color: "var(--ct-text-muted)", fontSize: FONT.sm }}>
              {r.started_at ? formatDate(r.started_at) : "—"}
            </td>
            <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px`, color: "var(--ct-text-muted)", fontSize: FONT.sm }}>
              {r.total_cost_usd > 0 ? `$${r.total_cost_usd.toFixed(4)}` : "—"}
            </td>
            <td style={{ padding: `${SPACING.s}px ${SPACING.lx}px`, textAlign: "right" }}>
              <Link
                href={`/swarms/${r.swarm_id}/runs/${r.run_id}`}
                style={{ color: "var(--ct-accent-strong)", fontSize: FONT.sm }}
              >
                View <Chevron direction="right" />
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default async function WorkspacePage() {
  // Auth — redirect if not logged in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?returnTo=/workspace");

  const ownerId = await getOwnerId();

  // Charger swarms (tous — templates inclus via backend qui retourne own + templates RLS)
  let allSwarms: SwarmListItem[] = [];
  let swarmsError: string | null = null;
  try {
    allSwarms = await swarmsClient.list(ownerId);
  } catch (err) {
    swarmsError = err instanceof Error ? err.message : "Failed to load swarms";
  }

  // Séparer owned vs templates
  const ownedSwarms = allSwarms.filter((s) => !s.is_template);
  const templateSwarms = allSwarms.filter((s) => s.is_template);

  // Charger les runs récents pour chaque swarm owned (max 3 par swarm, cross-swarms)
  const recentRuns: RecentRun[] = [];
  if (!swarmsError) {
    await Promise.allSettled(
      ownedSwarms.map(async (s) => {
        try {
          const runs: SwarmRunSummary[] = await swarmsClient.listRuns(s.id, 3, ownerId);
          for (const r of runs) {
            recentRuns.push({
              run_id: r.id,
              swarm_id: s.id,
              swarm_name: s.name,
              status: r.status,
              started_at: r.started_at ?? null,
              total_cost_usd: r.total_cost_usd ?? 0,
            });
          }
        } catch {
          // fail-soft par swarm
        }
      })
    );
    // Trier par started_at desc
    recentRuns.sort((a, b) => {
      if (!a.started_at) return 1;
      if (!b.started_at) return -1;
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    });
  }

  const totalRuns = recentRuns.length;
  const activeRuns = recentRuns.filter((r) => r.status === "running").length;

  return (
    <>
      <div className="ct-eyebrow">Cockpit · MySwarms</div>
      <h1 className="ct-title">Workspace</h1>
      <p className="ct-sub">
        Your tenant scope, swarms, and recent runs at a glance.
      </p>

      {/* Owner badge */}
      <OwnerBadge email={user.email ?? null} id={user.id} />

      {/* KPIs */}
      <KPIDashboard
        kpis={[
          { label: "Owned swarms", value: ownedSwarms.length, accent: true },
          { label: "Global templates", value: templateSwarms.length },
          { label: "Recent runs", value: totalRuns },
          { label: "Active runs", value: activeRuns },
        ]}
      />

      {swarmsError && (
        <div
          className="ct-card"
          role="alert"
          style={{
            borderColor: "var(--ct-alert-error-border)",
            background: "var(--ct-alert-error-bg)",
            color: "var(--ct-alert-error-text)",
            marginBottom: SPACING.lg,
          }}
        >
          Engine unreachable — {swarmsError}
        </div>
      )}

      {/* Section: Swarms tenant-owned */}
      <div style={{ marginBottom: SPACING.xxl }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.md }}>
          <SectionLabel text={`Your swarms — ${ownedSwarms.length}`} mb={0} />
          <Link href="/swarms/new" className="ct-seg-btn primary" style={{ fontSize: FONT.sm }}>
            + New swarm
          </Link>
        </div>
        <div className="ct-card" style={{ padding: 0, overflow: "hidden" }}>
          <SwarmTable swarms={ownedSwarms} variant="owned" />
        </div>
      </div>

      {/* Section: Templates globaux */}
      <div style={{ marginBottom: SPACING.xxl }}>
        <SectionLabel text={`Global templates — ${templateSwarms.length}`} />
        <div className="ct-card" style={{ padding: 0, overflow: "hidden" }}>
          <SwarmTable swarms={templateSwarms} variant="template" />
        </div>
      </div>

      {/* Section: Runs récents cross-swarms */}
      <div style={{ marginBottom: SPACING.xxl }}>
        <SectionLabel text={`Recent runs — ${totalRuns}`} />
        <div className="ct-card" style={{ padding: 0, overflow: "hidden" }}>
          <RecentRunsTable runs={recentRuns.slice(0, 20)} />
        </div>
      </div>

      {/* Section: Outputs/assets */}
      <div style={{ marginBottom: SPACING.xxl }}>
        <SectionLabel text="Outputs & assets" />
        <div className="ct-card">
          <div className="ct-placeholder">
            Outputs are stored per-run in{" "}
            <code style={{ fontSize: FONT.xs }}>swarm_run_steps.output_text</code> and{" "}
            <code style={{ fontSize: FONT.xs }}>swarm_runs.result_text</code>.
            No dedicated asset table exists yet.{" "}
            {ownedSwarms.length > 0 && (
              <>
                View outputs inside each{" "}
                <Link href="/swarms" className="ct-link">swarm run →</Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Section: Tools */}
      <div style={{ marginBottom: SPACING.xxl }}>
        <SectionLabel text="Available tools" />
        <div className="ct-card">
          <div className="ct-placeholder">
            No tools provisioned.{" "}
            <Link href="/tools" className="ct-link">Go to catalog →</Link>
          </div>
        </div>
      </div>

      {/* Tenant model note */}
      <div
        className="ct-card"
        style={{
          background: "var(--ct-surface-2)",
          borderColor: "var(--ct-border-soft)",
          padding: `${SPACING.md}px ${SPACING.lx}px`,
        }}
      >
        <span style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)" }}>
          Tenant model: <strong>owner_id = auth.uid()</strong> — single workspace per user.
          Templates (owner_id NULL, is_template=true) are globally visible.
          Multi-workspace support is not yet implemented.
        </span>
      </div>
    </>
  );
}
