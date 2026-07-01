import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { HistoriqueExplorer } from "@/components/automobile/HistoriqueExplorer";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { LinkButton } from "@/components/automobile/LinkButton";
import type { SwarmRunSummary, SwarmRun } from "@/lib/forms/swarmSchemas";
import { getDecisionsForRuns, type VehicleDecisionStatus } from "@/lib/automobile/decisions";

export const metadata = { title: "Historique — Automobile" };
export const dynamic = "force-dynamic";

const RUN_LIMIT = 50;

interface PageProps {
  searchParams: Promise<{ rec?: string }>;
}

export default async function HistoriquePage({ searchParams }: PageProps) {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (e) {
    if (e instanceof OwnerAuthError) redirect("/login?returnTo=/automobile/historique");
    throw e;
  }

  const { rec: recFilter } = await searchParams;

  let summaries: SwarmRunSummary[] = [];
  let runs: SwarmRun[] = [];
  let loadError: string | null = null;

  try {
    summaries = await swarmsClient.listRuns(AUTOMOBILE_SWARM_ID, RUN_LIMIT, ownerId);

    // Fetch full details en parallèle pour inputs_json + result_text
    const details = await Promise.allSettled(
      summaries.map((s) => swarmsClient.status(AUTOMOBILE_SWARM_ID, s.id, ownerId)),
    );
    runs = details
      .filter((r): r is PromiseFulfilledResult<SwarmRun> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement";
  }

  // Décisions humaines (sérialisables en objet pour le composant client)
  const decisionsMap = await getDecisionsForRuns(ownerId, runs.map((r) => r.id));
  const decisions: Record<string, VehicleDecisionStatus> = Object.fromEntries(decisionsMap);

  return (
    <>
      {/* Header */}
      <PageHeader
        className="mb-8"
        eyebrow="Cockpit · MySwarms · Automobile"
        title="Historique des analyses"
        subtitle={`${summaries.length} analyse${summaries.length > 1 ? "s" : ""} au total`}
        actions={
          <>
            <Link
              href="/automobile"
              className="text-xs font-medium text-accent hover:text-accent-strong"
            >
              ← Retour
            </Link>
            <LinkButton href="/automobile/nouvelle" variant="primary">
              → Nouvelle analyse
            </LinkButton>
          </>
        }
      />

      {/* Error */}
      {loadError && (
        <div
          role="alert"
          className="mb-6 rounded-[var(--radius-lg)] bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/25"
        >
          Engine indisponible — {loadError}
        </div>
      )}

      {/* Explorateur (filtres + recherche + tri + table, client-side) */}
      {!loadError &&
        (runs.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <h3 className="mb-4 text-sm font-semibold text-content-strong">
                Aucune analyse pour le moment
              </h3>
              <LinkButton href="/automobile/nouvelle" variant="primary">
                → Lancer une analyse
              </LinkButton>
            </CardBody>
          </Card>
        ) : (
          <HistoriqueExplorer runs={runs} initialRec={recFilter ?? ""} decisions={decisions} />
        ))}
    </>
  );
}
