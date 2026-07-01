import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "@heroicons/react/24/outline";
import { createClient } from "@/lib/supabase/server";
import { swarmsClient } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmListItem, SwarmRunSummary } from "@/lib/forms/swarmSchemas";
import {
  PageHeader,
  StatCard,
  KpiGrid,
  Card,
  CardBody,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  SectionLabel,
  Badge,
  Alert,
  EmptyState,
  Chevron,
} from "@/components/ui";

export const metadata = { title: "Workspace — MySwarms" };
export const dynamic = "force-dynamic";

// ── Helpers d'affichage ───────────────────────────────────────────────────────

function OwnerBadge({ email, id }: { email: string | null; id: string }) {
  return (
    <Card>
      <div className="flex items-center gap-4 px-5 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-white">
          {(email ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-content-strong">
            {email ?? "Authenticated user"}
          </div>
          <div className="mt-0.5 font-mono text-xs text-content-muted">owner_id: {id}</div>
        </div>
        <span className="text-xs uppercase tracking-wider text-content-muted">
          Single workspace
        </span>
      </div>
    </Card>
  );
}

function SwarmRow({ s, variant }: { s: SwarmListItem; variant: "owned" | "template" }) {
  return (
    <TR>
      <TD>
        <Link
          href={`/swarms/${s.id}`}
          className="font-semibold text-accent-strong hover:text-accent"
        >
          {s.name}
        </Link>
        {variant === "template" && (
          <Badge tone="neutral" className="ml-2">
            TEMPLATE
          </Badge>
        )}
      </TD>
      <TD className="text-sm text-content-muted">
        {s.agents_count} agent{s.agents_count !== 1 ? "s" : ""}
      </TD>
      <TD>
        {s.last_run_status ? (
          <StatusBadge status={s.last_run_status} />
        ) : (
          <span className="text-sm text-content-faint">—</span>
        )}
      </TD>
      <TD className="text-sm text-content-muted">
        {s.last_run_at ? formatDate(s.last_run_at) : "—"}
      </TD>
      <TD className="text-right">
        {variant === "owned" ? (
          <Link
            href={`/swarms/${s.id}/edit`}
            className="text-sm text-accent-strong hover:text-accent"
          >
            Edit
          </Link>
        ) : (
          <Link
            href={`/swarms/${s.id}`}
            className="text-sm text-accent-strong hover:text-accent"
          >
            View
          </Link>
        )}
      </TD>
    </TR>
  );
}

function SwarmTable({ swarms, variant }: { swarms: SwarmListItem[]; variant: "owned" | "template" }) {
  if (swarms.length === 0) {
    return (
      <EmptyState
        title={variant === "owned" ? "No swarm yet" : "No global template available"}
        description={
          variant === "owned"
            ? "Create your first swarm to start orchestrating agents."
            : undefined
        }
        action={
          variant === "owned" ? (
            <Link
              href="/swarms/new"
              className="text-sm text-accent-strong hover:text-accent"
            >
              Create one →
            </Link>
          ) : undefined
        }
      />
    );
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Name</TH>
          <TH>Agents</TH>
          <TH>Last status</TH>
          <TH>Last run</TH>
          <TH>
            <span className="sr-only">Actions</span>
          </TH>
        </TR>
      </THead>
      <TBody>
        {swarms.map((s) => (
          <SwarmRow key={s.id} s={s} variant={variant} />
        ))}
      </TBody>
    </Table>
  );
}

interface RecentRun {
  run_id: string;
  swarm_id: string;
  swarm_name: string;
  status: string;
  started_at: string | null;
}

function RecentRunsTable({ runs }: { runs: RecentRun[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No run yet"
        description="Kickoff a swarm to get started."
      />
    );
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Run ID</TH>
          <TH>Swarm</TH>
          <TH>Status</TH>
          <TH>Started</TH>
          <TH>
            <span className="sr-only">Actions</span>
          </TH>
        </TR>
      </THead>
      <TBody>
        {runs.map((r) => (
          <TR key={r.run_id}>
            <TD className="font-mono text-xs text-content-muted">{r.run_id.slice(0, 8)}</TD>
            <TD>
              <Link
                href={`/swarms/${r.swarm_id}`}
                className="text-sm text-accent-strong hover:text-accent"
              >
                {r.swarm_name}
              </Link>
            </TD>
            <TD>
              <StatusBadge status={r.status} />
            </TD>
            <TD className="text-sm text-content-muted">
              {r.started_at ? formatDate(r.started_at) : "—"}
            </TD>
            <TD className="text-right">
              <Link
                href={`/swarms/${r.swarm_id}/runs/${r.run_id}`}
                className="text-sm text-accent-strong hover:text-accent"
              >
                View <Chevron direction="right" />
              </Link>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
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
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Cockpit · MySwarms"
        title="Workspace"
        subtitle="Your tenant scope, swarms, and recent runs at a glance."
      />

      {/* Owner badge */}
      <OwnerBadge email={user.email ?? null} id={user.id} />

      {/* KPIs */}
      <KpiGrid>
        <StatCard label="Owned swarms" value={ownedSwarms.length} />
        <StatCard label="Global templates" value={templateSwarms.length} />
        <StatCard label="Recent runs" value={totalRuns} />
        <StatCard label="Active runs" value={activeRuns} />
      </KpiGrid>

      {swarmsError && (
        <Alert tone="error" role="alert">Engine unreachable — {swarmsError}</Alert>
      )}

      {/* Section: Swarms tenant-owned */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel text={`Your swarms — ${ownedSwarms.length}`} mb={0} />
          <Link
            href="/swarms/new"
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent-strong"
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            New swarm
          </Link>
        </div>
        <SwarmTable swarms={ownedSwarms} variant="owned" />
      </section>

      {/* Section: Templates globaux */}
      <section>
        <SectionLabel text={`Global templates — ${templateSwarms.length}`} />
        <SwarmTable swarms={templateSwarms} variant="template" />
      </section>

      {/* Section: Runs récents cross-swarms */}
      <section>
        <SectionLabel text={`Recent runs — ${totalRuns}`} />
        <RecentRunsTable runs={recentRuns.slice(0, 20)} />
      </section>

      {/* Section: Outputs/assets */}
      <section>
        <SectionLabel text="Outputs & assets" />
        <Card>
          <CardBody className="text-sm text-content-muted">
            Outputs are stored per-run in{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs text-content">
              swarm_run_steps.output_text
            </code>{" "}
            and{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs text-content">
              swarm_runs.result_text
            </code>
            . No dedicated asset table exists yet.{" "}
            {ownedSwarms.length > 0 && (
              <>
                View outputs inside each{" "}
                <Link href="/swarms" className="text-accent-strong hover:text-accent">
                  swarm run →
                </Link>
              </>
            )}
          </CardBody>
        </Card>
      </section>

      {/* Section: Tools */}
      <section>
        <SectionLabel text="Available tools" />
        <Card>
          <CardBody className="text-sm text-content-muted">
            No tools provisioned.{" "}
            <Link href="/tools" className="text-accent-strong hover:text-accent">
              Go to catalog →
            </Link>
          </CardBody>
        </Card>
      </section>

      {/* Tenant model note */}
      <Card className="bg-surface-2">
        <CardBody className="py-3 text-xs text-content-muted">
          Tenant model: <strong className="text-content">owner_id = auth.uid()</strong> — single
          workspace per user. Templates (owner_id NULL, is_template=true) are globally visible.
          Multi-workspace support is not yet implemented.
        </CardBody>
      </Card>
    </div>
  );
}
