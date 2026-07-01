import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { crewaiClient, CrewaiEngineError } from "@/lib/crewai/client";
import { formatDate } from "@/lib/utils/format";
import { isValidUuidV4 } from "@/lib/utils/uuid";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { requireOwnerId } from "@/lib/auth/owner";
import { Chevron } from "@/components/ui/Chevron";
import { PageTitle } from "@/components/ui/PageTitle";
import { ErrorLayout } from "@/components/ui/ErrorLayout";
import { Card, SectionLabel } from "@/components/ui";
import { LiveIndicator } from "@/components/runs/LiveIndicator";
import { isRunningStatus } from "@/lib/crewai/runStatus";

const CREW_NAME = "chief-of-staff";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ runId: string }>;
}

export default async function RunDetailPage({ params }: PageProps) {
  const { runId } = await params;

  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch {
    redirect(`/login?returnTo=${encodeURIComponent(`/crews/chief-of-staff/runs/${runId}`)}`);
  }

  // Validate UUID v4 format before hitting microservice.
  // Defense-in-depth: the microservice's Pydantic UUID type also validates,
  // but blocking here avoids unnecessary network calls + clarifies the contract.
  if (!isValidUuidV4(runId)) {
    notFound();
  }

  let run;
  try {
    run = await crewaiClient.status(CREW_NAME, runId, { ownerId });
  } catch (err) {
    if (err instanceof CrewaiEngineError && err.status === 404) {
      notFound();
    }
    return (
      <>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-content-muted transition-colors hover:text-content"
        >
          <Chevron direction="left" />
          Cockpit
        </Link>
        <ErrorLayout
          title="Run not found"
          message={`Failed to load run: ${err instanceof Error ? err.message : "unknown error"}`}
        />
      </>
    );
  }

  let resultPretty: string | null = null;
  if (run.result) {
    try {
      const parsed: unknown = JSON.parse(run.result);
      resultPretty = JSON.stringify(parsed, null, 2);
    } catch {
      resultPretty = null;
    }
  }

  const isRunning = isRunningStatus(run.status);

  const statePretty = run.state ? JSON.stringify(run.state, null, 2) : null;
  const triggerLabel =
    run.state && typeof run.state === "object" && "trigger" in run.state
      ? String((run.state as Record<string, unknown>)["trigger"])
      : "?";

  return (
    <>
      {/* Auto-refresh every 5s while the crew flow is running. Stops when status is terminal. */}
      <AutoRefresh active={isRunning} seconds={5} />

      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-content-muted transition-colors hover:text-content"
      >
        <Chevron direction="left" />
        Cockpit
      </Link>

      <div className="mt-2 mb-8">
        <PageTitle variant="mono" style={{ marginBottom: "0.75rem" }}>
          {runId.slice(0, 8)}…
        </PageTitle>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={run.status} size="md" />
          <span className="text-content-faint">·</span>
          <span className="text-sm text-content-muted">
            trigger :{" "}
            <span className="font-mono text-content-strong">{triggerLabel}</span>
          </span>
          {isRunning && run.status !== "paused_hitl" && <LiveIndicator intervalSeconds={5} />}
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetaField
          label="Started at"
          value={formatDate(run.started_at, { withSeconds: true, withYear: true })}
        />
        <MetaField
          label="Finished at"
          value={
            run.finished_at
              ? formatDate(run.finished_at, { withSeconds: true, withYear: true })
              : "—"
          }
        />
      </div>

      <div className="mb-8">
        <SectionLabel text="Result" />
        {run.result ? (
          <Card className="overflow-hidden">
            <pre className="overflow-auto p-5 font-mono text-xs leading-relaxed text-content">
              {resultPretty ?? run.result}
            </pre>
          </Card>
        ) : (
          <p className="text-sm text-content-faint">No result yet.</p>
        )}
      </div>

      {statePretty && (
        <div>
          <SectionLabel text="State" />
          <Card className="overflow-hidden">
            <pre className="overflow-auto p-5 font-mono text-xs leading-relaxed text-content">
              {statePretty}
            </pre>
          </Card>
        </div>
      )}
    </>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-content-muted">
        {label}
      </div>
      <div className="font-mono text-sm text-content-strong">{value}</div>
    </Card>
  );
}
