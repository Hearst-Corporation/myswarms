import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { HistoriqueExplorer } from "@/components/automobile/HistoriqueExplorer";
import { FONT, SPACING } from "@/lib/ui/tokens";
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
      <div className="ct-eyebrow">Cockpit · MySwarms · Automobile</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: SPACING.lg,
          flexWrap: "wrap",
          marginBottom: SPACING.xxl,
        }}
      >
        <div>
          <h1 className="ct-title">Historique des analyses</h1>
          <p className="ct-sub">
            {summaries.length} analyse{summaries.length > 1 ? "s" : ""} au total
          </p>
        </div>
        <div style={{ display: "flex", gap: SPACING.sm, alignSelf: "center", flexWrap: "wrap" }}>
          <Link href="/automobile" className="ct-link" style={{ fontSize: FONT.xs }}>
            ← Retour
          </Link>
          <Link href="/automobile/nouvelle" className="ct-seg-btn primary" style={{ whiteSpace: "nowrap" }}>
            → Nouvelle analyse
          </Link>
        </div>
      </div>

      {/* Error */}
      {loadError && (
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
          Engine indisponible — {loadError}
        </div>
      )}

      {/* Explorateur (filtres + recherche + tri + table, client-side) */}
      {!loadError &&
        (runs.length === 0 ? (
          <div className="ct-card" style={{ textAlign: "center", padding: `${SPACING.xxl}px` }}>
            <div className="ct-card-title" style={{ marginBottom: SPACING.md }}>
              Aucune analyse pour le moment
            </div>
            <Link href="/automobile/nouvelle" className="ct-seg-btn primary">
              → Lancer une analyse
            </Link>
          </div>
        ) : (
          <HistoriqueExplorer runs={runs} initialRec={recFilter ?? ""} decisions={decisions} />
        ))}
    </>
  );
}
