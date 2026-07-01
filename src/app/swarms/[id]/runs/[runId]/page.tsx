// TODO V2 — Race multi-onglets polling :
// Si l'utilisateur ouvre la même page run dans N onglets en parallèle, chaque
// onglet déclenche son propre `AutoRefresh` → N polls/sec vers
// /api/swarms/[id]/runs/[runId]. Pas critique en single-user (charge négligeable
// sur l'engine), mais à corriger en V2 multi-tenant via :
//  - BroadcastChannel cross-tab pour partager le dernier état (1 onglet leader,
//    les autres écoutent) ;
//  - OU SSE / WebSocket côté engine pour push en lieu et place du polling.
// Cf reviewer Stage 4 — dette acceptée pour V1 (pas de fix code immédiat).
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { isValidUuid } from "@/lib/utils/uuid";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { RunTimeline } from "@/components/swarms/RunTimeline";
import { MarkdownReport } from "@/components/swarms/MarkdownReport";
import { isMarkdown } from "@/lib/swarms/markdown";
import {
  Chevron,
  PageTitle,
  ErrorLayout,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  SectionLabel,
} from "@/components/ui";
import { LiveIndicator } from "@/components/runs/LiveIndicator";
import { isRunningStatus } from "@/lib/crewai/runStatus";

export const dynamic = "force-dynamic";

const BREADCRUMB =
  "inline-flex items-center text-xs font-semibold uppercase tracking-wider text-content-muted hover:text-content";

interface PageProps {
  params: Promise<{ id: string; runId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id, runId } = await params;
  if (!isValidUuid(id) || !isValidUuid(runId)) return { title: "Run not found" };
  try {
    const ownerId = await getOwnerId();
    const swarm = await swarmsClient.get(id, ownerId);
    return { title: `${swarm.name} · Run ${runId.slice(0, 8)} — MySwarms` };
  } catch {
    return { title: `Run ${runId.slice(0, 8)} — MySwarms` };
  }
}

export default async function SwarmRunDetailPage({ params }: PageProps) {
  const { id, runId } = await params;
  if (!isValidUuid(id) || !isValidUuid(runId)) notFound();

  // Load swarm name for context — fail-soft (not required for run display)
  let swarmName: string | null = null;
  try {
    const ownerId = await getOwnerId();
    const swarm = await swarmsClient.get(id, ownerId);
    swarmName = swarm.name;
  } catch {
    // silencieux — le nom est un enrichissement contextuel, pas bloquant
  }

  let run;
  try {
    const ownerId = await getOwnerId();
    run = await swarmsClient.status(id, runId, ownerId);
  } catch (err) {
    if (err instanceof SwarmEngineError && err.status === 404) notFound();
    return (
      <div className="flex flex-col gap-6">
        <Link href={`/swarms/${id}`} className={BREADCRUMB}>
          <Chevron direction="left" />Swarm
        </Link>
        <ErrorLayout
          title="Run not found"
          message={err instanceof Error ? err.message : "Unknown error"}
        />
      </div>
    );
  }

  const isRunning = isRunningStatus(run.status);

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh active={isRunning} seconds={5} />
      <Link href={`/swarms/${id}`} className={BREADCRUMB}>
        <Chevron direction="left" />
        {swarmName ?? "Swarm"}
      </Link>

      <div className="border-b border-line pb-5">
        {swarmName && (
          <div className="mb-1 text-sm text-content-muted">{swarmName}</div>
        )}
        <PageTitle variant="mono">Run {runId.slice(0, 8)}…</PageTitle>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <StatusBadge status={run.status} size="md" />
          <span className="text-sm text-content-muted">
            trigger : {run.trigger}
          </span>
          {isRunning && run.status !== "paused_hitl" && (
            <LiveIndicator intervalSeconds={5} />
          )}
        </div>
      </div>

      <KPIDashboard
        kpis={[
          {
            label: "Tokens in",
            value: run.total_tokens_in.toLocaleString("en-US"),
            accent: true,
          },
          {
            label: "Tokens out",
            value: run.total_tokens_out.toLocaleString("en-US"),
          },
          { label: "Steps", value: run.steps.length },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <MetaField
            label="Started"
            value={formatDate(run.started_at, {
              withSeconds: true,
              withYear: true,
            })}
          />
          <MetaField
            label="Finished"
            value={
              run.finished_at
                ? formatDate(run.finished_at, {
                    withSeconds: true,
                    withYear: true,
                  })
                : "—"
            }
          />
          {run.langfuse_trace_id ? (
            <MetaField label="Langfuse trace" value={run.langfuse_trace_id} mono />
          ) : null}
        </CardBody>
      </Card>

      {run.error_text != null && run.error_text !== "" ? (
        <Card className="ring-[color-mix(in_oklab,var(--color-danger)_30%,transparent)]">
          <CardHeader>
            <CardTitle className="text-danger">Error</CardTitle>
          </CardHeader>
          <CardBody>
            <pre className="whitespace-pre-wrap break-words font-mono text-sm text-content">
              {run.error_text}
            </pre>
          </CardBody>
        </Card>
      ) : null}

      {run.result_text != null ? (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardBody>
            {isMarkdown(run.result_text) ? (
              <MarkdownReport
                text={run.result_text}
                title={`run-${runId.slice(0, 8)}`}
              />
            ) : (
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-surface-2 p-3 font-mono text-sm text-content ring-1 ring-inset ring-line">
                {prettyJsonOrRaw(run.result_text)}
              </pre>
            )}
          </CardBody>
        </Card>
      ) : null}

      <div>
        <SectionLabel text={`Timeline (${run.steps.length} steps)`} />
        <RunTimeline steps={run.steps} status={run.status} />
      </div>
    </div>
  );
}

function MetaField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <SectionLabel text={label} />
      <div
        className={
          "break-all text-sm text-content " + (mono ? "font-mono" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function prettyJsonOrRaw(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}
