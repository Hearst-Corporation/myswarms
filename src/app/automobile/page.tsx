import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmRunSummary, SwarmRun } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, SPACING } from "@/lib/ui/tokens";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import { RecommendationBadge } from "@/components/swarms/RecommendationBadge";
import { getVehicleLabel } from "@/lib/automobile/vehicleLabel";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";

export const metadata = { title: "Automobile — MySwarms" };
export const dynamic = "force-dynamic";

const RUN_LIMIT = 50;
const RECENT_COUNT = 5;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AutomobilePage() {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (e) {
    if (e instanceof OwnerAuthError) redirect("/login?returnTo=/automobile");
    throw e;
  }

  let summaries: SwarmRunSummary[] = [];
  let recentRuns: SwarmRun[] = [];
  let loadError: string | null = null;

  try {
    summaries = await swarmsClient.listRuns(AUTOMOBILE_SWARM_ID, RUN_LIMIT, ownerId);

    // Fetch full details seulement pour les plus récents (inputs_json + result_text)
    const top5 = [...summaries]
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, RECENT_COUNT);

    const details = await Promise.allSettled(
      top5.map((s) => swarmsClient.status(AUTOMOBILE_SWARM_ID, s.id, ownerId))
    );
    recentRuns = details
      .filter((r): r is PromiseFulfilledResult<SwarmRun> => r.status === "fulfilled")
      .map((r) => r.value);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement";
  }

  // KPIs
  const total = summaries.length;
  const completed = summaries.filter((r) => r.status === "completed").length;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <>
      {/* Header */}
      <div className="ct-eyebrow">Cockpit · MySwarms</div>
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
          <h1 className="ct-title">Analyse Automobile</h1>
          <p className="ct-sub">
            Analysez n&apos;importe quel véhicule d&apos;occasion — rapport complet,
            recommandation d&apos;achat, prix marché.
          </p>
        </div>
        <div style={{ display: "flex", gap: SPACING.sm, alignSelf: "center", flexWrap: "wrap" }}>
          <Link
            href="/automobile/marche"
            className="ct-seg-btn"
            style={{ whiteSpace: "nowrap" }}
          >
            Cote marché
          </Link>
          <Link
            href="/automobile/nouvelle"
            className="ct-seg-btn primary"
            style={{ whiteSpace: "nowrap" }}
          >
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

      {/* KPIs */}
      {!loadError && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: SPACING.lg,
            marginBottom: SPACING.xxl,
          }}
        >
          <KPICard label="Total analyses" value={total} accent />
          <KPICard label="Complétées" value={completed} />
          <KPICard label="Taux de succès" value={`${successRate}%`} />
        </div>
      )}

      {/* Analyses récentes */}
      {!loadError && (
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
              Analyses récentes
            </span>
            <Link
              href="/automobile/historique"
              className="ct-link"
              style={{ fontSize: FONT.xs }}
            >
              Voir tout l&apos;historique →
            </Link>
          </div>

          {recentRuns.length === 0 ? (
            <div
              className="ct-card"
              style={{ textAlign: "center", padding: `${SPACING.xxl}px` }}
            >
              <div className="ct-card-title" style={{ marginBottom: SPACING.md }}>
                Aucune analyse pour le moment
              </div>
              <p className="ct-card-body" style={{ marginBottom: SPACING.xl }}>
                Lancez votre première analyse pour obtenir un rapport détaillé sur un véhicule.
              </p>
              <Link href="/automobile/nouvelle" className="ct-seg-btn primary">
                → Nouvelle analyse
              </Link>
            </div>
          ) : (
            <div className="ct-card" style={{ padding: 0 }}>
              {recentRuns.map((run, idx) => {
                const inp = run.inputs_json ?? {};
                const label = getVehicleLabel(inp);
                const rec = extractRecommendation(run.result_text);
                return (
                  <div
                    key={run.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: SPACING.md,
                      padding: `${SPACING.md}px ${SPACING.lg}px`,
                      borderBottom:
                        idx < recentRuns.length - 1
                          ? "1px solid var(--ct-border-soft)"
                          : "none",
                    }}
                  >
                    {/* Véhicule */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: FONT.sm,
                          fontWeight: FONT_WEIGHT.semibold,
                          color: "var(--ct-text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          fontSize: FONT.xs,
                          color: "var(--ct-text-faint)",
                          marginTop: 2,
                        }}
                      >
                        {formatDate(run.started_at)}
                      </div>
                    </div>

                    {/* Statut */}
                    <StatusBadge status={run.status} />

                    {/* Recommandation */}
                    <RecommendationBadge rec={rec} />

                    {/* Lien */}
                    <Link
                      href={`/automobile/${run.id}`}
                      className="ct-link"
                      style={{ fontSize: FONT.xs, whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                      Voir →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className="ct-card"
      style={{
        padding: `${SPACING.lg}px`,
        borderColor: accent ? "var(--ct-accent-strong)" : undefined,
      }}
    >
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
        {label}
      </div>
      <div
        style={{
          fontSize: FONT.xxl,
          fontWeight: FONT_WEIGHT.extrabold,
          color: accent ? "var(--ct-accent-strong)" : "var(--ct-text-primary)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}
