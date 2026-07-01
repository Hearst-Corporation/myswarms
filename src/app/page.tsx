import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusIcon } from "@heroicons/react/24/outline";
import { requireOwnerId } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import {
  PageHeader,
  StatCard,
  KpiGrid,
  Card,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  SectionLabel,
  EmptyState,
} from "@/components/ui";
import type { SwarmListItem, SwarmRunSummary } from "@/lib/forms/swarmSchemas";

export const metadata = { title: "MySwarms · Dashboard" };
export const dynamic = "force-dynamic";

function DurationLabel({
  startedAt,
  finishedAt,
}: {
  startedAt: string | null | undefined;
  finishedAt: string | null | undefined;
}) {
  if (!startedAt) return <span className="text-content-faint">—</span>;
  const end = finishedAt ? new Date(finishedAt) : null;
  if (!end) return <span className="text-sm text-content-muted">en cours</span>;
  const ms = end.getTime() - new Date(startedAt).getTime();
  if (ms < 0) return <span className="text-content-faint">—</span>;
  const s = Math.round(ms / 1000);
  if (s < 60) return <span className="text-sm text-content-muted">{s}s</span>;
  return <span className="text-sm text-content-muted">{Math.round(s / 60)}m</span>;
}

function TokensLabel({ tokensIn, tokensOut }: { tokensIn: number; tokensOut: number }) {
  const total = tokensIn + tokensOut;
  if (total === 0) return <span className="text-content-faint">—</span>;
  return (
    <span className="font-mono text-sm text-content-muted">{total.toLocaleString()}</span>
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
    <main className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Cockpit · MySwarms"
        title="Orchestration Dashboard"
        subtitle={today}
        actions={
          <Link
            href="/swarms/new"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            Nouveau swarm
          </Link>
        }
      />

      {/* KPIs */}
      <KpiGrid className="lg:grid-cols-3">
        <StatCard
          label="Swarms actifs"
          value={activeSwarmCount}
          hint="non-templates · actifs"
        />
        <StatCard
          label="Runs complétés"
          value={completedCount}
          hint="sur les 10 derniers runs"
        />
        <StatCard
          label="Taux de succès"
          value={successRate !== null ? `${successRate}%` : "—"}
          hint={total > 0 ? `${completedCount}/${total} runs` : "aucun run récent"}
        />
      </KpiGrid>

      {/* Table des derniers runs */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionLabel text={`Derniers runs — ${top10.length}`} mb={0} />
          <Link href="/swarms" className="text-sm text-accent-strong hover:text-accent">
            Voir tous les swarms →
          </Link>
        </div>

        {top10.length === 0 ? (
          <Card className="overflow-hidden">
            <EmptyState
              title="Aucun run récent"
              description="Créez un swarm pour lancer votre première orchestration."
              action={
                <Link
                  href="/swarms/new"
                  className="text-sm text-accent-strong hover:text-accent"
                >
                  Créer un swarm →
                </Link>
              }
            />
          </Card>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Swarm</TH>
                <TH>Status</TH>
                <TH>Démarré</TH>
                <TH>Durée</TH>
                <TH>Tokens</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {top10.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link
                      href={`/swarms/${r.swarmId}`}
                      className="text-sm font-semibold text-accent-strong hover:text-accent"
                    >
                      {r.swarmName}
                    </Link>
                  </TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                  <TD className="text-sm text-content-muted">{formatDate(r.started_at)}</TD>
                  <TD>
                    <DurationLabel startedAt={r.started_at} finishedAt={r.finished_at} />
                  </TD>
                  <TD>
                    <TokensLabel
                      tokensIn={r.total_tokens_in ?? 0}
                      tokensOut={r.total_tokens_out ?? 0}
                    />
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/swarms/${r.swarmId}/runs/${r.id}`}
                      className="text-sm text-accent-strong hover:text-accent"
                    >
                      View →
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </main>
  );
}
