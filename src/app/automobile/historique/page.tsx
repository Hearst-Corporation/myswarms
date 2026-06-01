import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import { RecommendationBadge } from "@/components/swarms/RecommendationBadge";
import { getVehicleLabel } from "@/lib/automobile/vehicleLabel";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import { FONT, FONT_WEIGHT, SPACING, RADIUS, LETTER_SPACING } from "@/lib/ui/tokens";
import type { SwarmRunSummary, SwarmRun } from "@/lib/forms/swarmSchemas";
import { thStyle, tdStyle } from "@/lib/ui/tableStyles";

export const metadata = { title: "Historique — Automobile" };
export const dynamic = "force-dynamic";

const RUN_LIMIT = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getDurationMs(run: { started_at: string; finished_at?: string | null }): number | null {
  if (!run.started_at || !run.finished_at) return null;
  return new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

const FILTER_OPTS: Array<{ label: string; value: string }> = [
  { label: "Tous", value: "" },
  { label: "APPELER", value: "APPELER" },
  { label: "ATTENDRE", value: "ATTENDRE" },
  { label: "ÉVITER", value: "ÉVITER" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ rec?: string }>;
}

export default async function HistoriquePage({ searchParams }: PageProps) {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (e) {
    if (e instanceof OwnerAuthError) redirect("/login");
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
      summaries.map((s) => swarmsClient.status(AUTOMOBILE_SWARM_ID, s.id, ownerId))
    );
    runs = details
      .filter((r): r is PromiseFulfilledResult<SwarmRun> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement";
  }

  // Filtrage par recommandation
  const filtered =
    recFilter
      ? runs.filter((r) => extractRecommendation(r.result_text) === recFilter)
      : runs;

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

      {/* Filtres */}
      {!loadError && (
        <div
          style={{
            display: "flex",
            gap: SPACING.sm,
            marginBottom: SPACING.lg,
            flexWrap: "wrap",
          }}
        >
          {FILTER_OPTS.map((opt) => {
            const isActive = (recFilter ?? "") === opt.value;
            const href = opt.value
              ? `/automobile/historique?rec=${encodeURIComponent(opt.value)}`
              : "/automobile/historique";
            return (
              <Link
                key={opt.value || "all"}
                href={href}
                style={{
                  display: "inline-block",
                  padding: `${SPACING.xs}px ${SPACING.md}px`,
                  borderRadius: RADIUS.full,
                  fontSize: FONT.xs,
                  fontWeight: FONT_WEIGHT.bold,
                  letterSpacing: LETTER_SPACING.wide,
                  textTransform: "uppercase",
                  textDecoration: "none",
                  border: isActive
                    ? "1px solid var(--ct-accent-strong)"
                    : "1px solid var(--ct-border)",
                  background: isActive ? "var(--ct-accent-strong)" : "var(--ct-surface-2)",
                  color: isActive ? "var(--ct-text-on-accent)" : "var(--ct-text-muted)",
                  transition: "all 120ms",
                }}
              >
                {opt.label}
              </Link>
            );
          })}
          {recFilter && (
            <span
              style={{
                fontSize: FONT.xs,
                color: "var(--ct-text-faint)",
                alignSelf: "center",
                marginLeft: SPACING.xs,
              }}
            >
              {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Tableau */}
      {!loadError && (
        <>
          {filtered.length === 0 ? (
            <div
              className="ct-card"
              style={{ textAlign: "center", padding: `${SPACING.xxl}px` }}
            >
              <div className="ct-card-title" style={{ marginBottom: SPACING.md }}>
                Aucune analyse{recFilter ? ` avec la recommandation "${recFilter}"` : ""}
              </div>
              {recFilter ? (
                <Link href="/automobile/historique" className="ct-link">
                  Voir toutes les analyses →
                </Link>
              ) : (
                <Link href="/automobile/nouvelle" className="ct-seg-btn primary">
                  → Lancer une analyse
                </Link>
              )}
            </div>
          ) : (
            <div className="ct-card" style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.sm }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--ct-border)" }}>
                    <th style={thStyle}>Véhicule</th>
                    <th style={thStyle}>Recommandation</th>
                    <th style={thStyle}>Statut</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Durée</th>
                    <th style={{ ...thStyle, textAlign: "right" as const }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((run, idx) => {
                    const inp = run.inputs_json ?? {};
                    const label = getVehicleLabel(inp);
                    const rec = extractRecommendation(run.result_text);
                    const dur = getDurationMs(run);
                    return (
                      <tr
                        key={run.id}
                        style={{
                          borderBottom:
                            idx < filtered.length - 1
                              ? "1px solid var(--ct-border-soft)"
                              : "none",
                        }}
                      >
                        {/* Véhicule */}
                        <td style={{ ...tdStyle, fontWeight: FONT_WEIGHT.semibold }}>
                          <div style={{ color: "var(--ct-text-primary)" }}>{label}</div>
                          {inp.fuel ? (
                            <div
                              style={{
                                fontSize: FONT.xs,
                                color: "var(--ct-text-faint)",
                                marginTop: 2,
                              }}
                            >
                              {String(inp.fuel)}
                              {inp.mileage_km ? ` · ${Number(inp.mileage_km).toLocaleString("fr-FR")} km` : ""}
                              {inp.price_eur ? ` · ${Number(inp.price_eur).toLocaleString("fr-FR")} €` : ""}
                            </div>
                          ) : null}
                        </td>

                        {/* Recommandation */}
                        <td style={tdStyle}>
                          <RecommendationBadge rec={rec} />
                        </td>

                        {/* Statut */}
                        <td style={tdStyle}>
                          <StatusBadge status={run.status} />
                        </td>

                        {/* Date */}
                        <td
                          style={{
                            ...tdStyle,
                            color: "var(--ct-text-muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatDate(run.started_at)}
                        </td>

                        {/* Durée */}
                        <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                          {dur ? fmtDuration(dur) : "—"}
                        </td>

                        {/* Lien */}
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <Link
                            href={`/automobile/${run.id}`}
                            className="ct-link"
                            style={{ fontSize: FONT.xs, whiteSpace: "nowrap" }}
                          >
                            Voir →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
