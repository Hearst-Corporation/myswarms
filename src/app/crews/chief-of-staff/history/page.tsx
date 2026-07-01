import Link from "next/link";
import { redirect } from "next/navigation";
import { crewaiClient } from "@/lib/crewai/client";
import type { RunSummary } from "@/lib/crewai/types";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { requireOwnerId } from "@/lib/auth/owner";
import {
  PageHeader,
  SectionLabel,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyState,
  Alert,
} from "@/components/ui";
import { Chevron } from "@/components/ui/Chevron";

const CREW_NAME = "chief-of-staff";

export const metadata = { title: "Run history — Chief of Staff — MySwarms" };
export const dynamic = "force-dynamic";

export default async function ChiefOfStaffHistoryPage() {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch {
    redirect("/login?returnTo=/crews/chief-of-staff/history");
  }

  let runs: RunSummary[] = [];
  let listError: string | null = null;
  try {
    runs = await crewaiClient.listRuns(CREW_NAME, 20, { ownerId });
  } catch (err) {
    listError = err instanceof Error ? err.message : "Failed to load runs";
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

      <div className="mt-2 mb-8">
        <PageHeader
          title="Run history"
          subtitle="Last 20 runs of the Daily Chief of Staff"
          eyebrow="Chief of Staff"
        />
      </div>

      <section>
        <SectionLabel text="Recent runs" />

        {listError ? (
          <Alert tone="error" role="alert" title="Failed to load runs">
            {listError}
          </Alert>
        ) : runs.length === 0 ? (
          <EmptyState
            title="No run yet"
            description="Trigger a brief from the main page to see it appear here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Kickoff ID</TH>
                <TH>Trigger</TH>
                <TH>Status</TH>
                <TH>Started</TH>
                <TH>Finished</TH>
              </TR>
            </THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.kickoff_id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/crews/${CREW_NAME}/runs/${r.kickoff_id}`}
                      prefetch={false}
                      className="text-accent transition-colors hover:text-accent-strong"
                    >
                      {r.kickoff_id.slice(0, 8)}…
                    </Link>
                  </TD>
                  <TD>{r.trigger}</TD>
                  <TD>
                    <StatusBadge status={r.status} />
                  </TD>
                  <TD className="text-xs text-content-muted">{formatDate(r.started_at)}</TD>
                  <TD className="text-xs text-content-muted">
                    {r.finished_at ? formatDate(r.finished_at) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </>
  );
}
