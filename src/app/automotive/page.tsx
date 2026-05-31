import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmRun } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";
import { Chevron } from "@/components/ui/Chevron";

export const metadata = { title: "Automotive — MySwarms" };
export const dynamic = "force-dynamic";

// UUID du template global APM — Vehicle Research
const APM_SWARM_ID = "cccccccc-0001-0001-0001-000000000001";
const APM_RUN_LIMIT = 50;

// ── Domain helpers ────────────────────────────────────────────────────────────

const REC_REGEX = /\*\*(APPELER|ATTENDRE|ÉVITER|EVITER)\*\*/i;

type Recommendation = "APPELER" | "ATTENDRE" | "ÉVITER" | "UNKNOWN";

function parseRecommendation(resultText: string | null | undefined): Recommendation {
  if (!resultText) return "UNKNOWN";
  const m = resultText.match(REC_REGEX);
  if (!m) return "UNKNOWN";
  const v = m[1].toUpperCase();
  if (v === "EVITER") return "ÉVITER";
  return v as Recommendation;
}

function getVehicleLabel(inputs: Record<string, unknown>): string {
  const parts: string[] = [];
  if (inputs.year) parts.push(String(inputs.year));
  if (inputs.make) parts.push(String(inputs.make));
  if (inputs.model) parts.push(String(inputs.model));
  return parts.join(" ") || "Véhicule";
}

function getDurationMs(run: SwarmRun): number | null {
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

function extractDomain(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ── Sub-components (RSC — no hooks) ──────────────────────────────────────────

const REC_COLOR: Record<Recommendation, string> = {
  APPELER: "var(--ct-state-ok)",
  ATTENDRE: "var(--ct-accent-strong)",
  "ÉVITER": "var(--ct-alert-error-text)",
  UNKNOWN: "var(--ct-text-faint)",
};

const REC_BG: Record<Recommendation, string> = {
  APPELER: "rgba(39,174,96,0.12)",
  ATTENDRE: "rgba(192,57,43,0.10)",
  "ÉVITER": "rgba(231,76,60,0.12)",
  UNKNOWN: "var(--ct-surface-3)",
};

function RecBadge({ rec }: { rec: Recommendation }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: `${SPACING.xs}px ${SPACING.sm}px`,
        borderRadius: RADIUS.full,
        fontSize: FONT.xs,
        fontWeight: FONT_WEIGHT.bold,
        letterSpacing: LETTER_SPACING.wide,
        textTransform: "uppercase",
        color: REC_COLOR[rec],
        background: REC_BG[rec],
      }}
    >
      {rec === "UNKNOWN" ? "—" : rec}
    </span>
  );
}

// Mini horizontal bar showing proportions
function RecBar({
  appeler, attendre, eviter, unknown, total,
}: { appeler: number; attendre: number; eviter: number; unknown: number; total: number }) {
  if (total === 0) return null;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 8,
          borderRadius: RADIUS.full,
          overflow: "hidden",
          gap: 2,
          marginBottom: SPACING.sm,
        }}
      >
        {appeler > 0 && (
          <div style={{ width: pct(appeler), background: REC_COLOR.APPELER, borderRadius: RADIUS.xs }} />
        )}
        {attendre > 0 && (
          <div style={{ width: pct(attendre), background: REC_COLOR.ATTENDRE, borderRadius: RADIUS.xs }} />
        )}
        {eviter > 0 && (
          <div style={{ width: pct(eviter), background: REC_COLOR.ÉVITER, borderRadius: RADIUS.xs }} />
        )}
        {unknown > 0 && (
          <div style={{ width: pct(unknown), background: "var(--ct-surface-3)", borderRadius: RADIUS.xs }} />
        )}
      </div>
      <div style={{ display: "flex", gap: SPACING.lg, flexWrap: "wrap" }}>
        {appeler > 0 && (
          <span style={{ fontSize: FONT.xs, color: REC_COLOR.APPELER }}>
            APPELER {appeler}
          </span>
        )}
        {attendre > 0 && (
          <span style={{ fontSize: FONT.xs, color: REC_COLOR.ATTENDRE }}>
            ATTENDRE {attendre}
          </span>
        )}
        {eviter > 0 && (
          <span style={{ fontSize: FONT.xs, color: REC_COLOR.ÉVITER }}>
            ÉVITER {eviter}
          </span>
        )}
        {unknown > 0 && (
          <span style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>
            Non parsée {unknown}
          </span>
        )}
      </div>
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: `${SPACING.s}px ${SPACING.md}px`,
  color: "var(--ct-text-body)",
  fontSize: FONT.sm,
  verticalAlign: "middle",
};
const thStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.bold,
  letterSpacing: LETTER_SPACING.wide,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
  textAlign: "left" as const,
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AutomotivePage() {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (e) {
    if (e instanceof OwnerAuthError) redirect("/login");
    throw e;
  }

  // Load all APM runs (summaries) then detail in parallel for inputs/result
  let runs: SwarmRun[] = [];
  let loadError: string | null = null;

  try {
    const summaries = await swarmsClient.listRuns(APM_SWARM_ID, APM_RUN_LIMIT, ownerId);

    // Fetch full run details in parallel (inputs_json + result_text)
    const details = await Promise.allSettled(
      summaries.map((s) => swarmsClient.status(APM_SWARM_ID, s.id, ownerId))
    );
    runs = details
      .filter((r): r is PromiseFulfilledResult<SwarmRun> => r.status === "fulfilled")
      .map((r) => r.value);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement";
  }

  // ── Derived stats ──────────────────────────────────────────────────────────

  const total = runs.length;
  const completed = runs.filter((r) => r.status === "completed").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const running = runs.filter((r) => r.status === "running").length;

  const totalTokensIn = runs.reduce((acc, r) => acc + r.total_tokens_in, 0);
  const totalTokensOut = runs.reduce((acc, r) => acc + r.total_tokens_out, 0);
  const totalTokens = totalTokensIn + totalTokensOut;

  const totalCost = runs.reduce((acc, r) => acc + r.total_cost_usd, 0);
  const hasCost = totalCost > 0;

  // Duration average (completed runs only)
  const durations = runs
    .filter((r) => r.status === "completed")
    .map((r) => getDurationMs(r))
    .filter((d): d is number => d !== null);
  const avgDurationMs = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;

  // Recommendations
  const recs = runs.map((r) => parseRecommendation(r.result_text));
  const recCounts = {
    APPELER: recs.filter((r) => r === "APPELER").length,
    ATTENDRE: recs.filter((r) => r === "ATTENDRE").length,
    "ÉVITER": recs.filter((r) => r === "ÉVITER").length,
    UNKNOWN: recs.filter((r) => r === "UNKNOWN").length,
  };

  // Countries
  const countryMap: Record<string, number> = {};
  for (const r of runs) {
    const c = r.inputs_json?.country;
    if (typeof c === "string" && c) {
      countryMap[c.toUpperCase()] = (countryMap[c.toUpperCase()] ?? 0) + 1;
    }
  }
  const countries = Object.entries(countryMap).sort((a, b) => b[1] - a[1]);

  // Source domains
  const domainMap: Record<string, number> = {};
  for (const r of runs) {
    const d = extractDomain(r.inputs_json?.source_url);
    if (d) domainMap[d] = (domainMap[d] ?? 0) + 1;
  }
  const domains = Object.entries(domainMap).sort((a, b) => b[1] - a[1]);

  // Recent runs sorted by date desc
  const recentRuns = [...runs].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );

  // ── Render ─────────────────────────────────────────────────────────────────

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
          marginBottom: SPACING.xl,
        }}
      >
        <div>
          <h1 className="ct-title">Automotive</h1>
          <p className="ct-sub">Analyse véhicule et rapports d'achat VO</p>
        </div>
        <Link
          href={`/swarms/${APM_SWARM_ID}`}
          className="ct-seg-btn primary"
          style={{ alignSelf: "center" }}
        >
          + Lancer une recherche véhicule
        </Link>
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

      {/* Empty state */}
      {!loadError && total === 0 && (
        <div className="ct-card" style={{ textAlign: "center", padding: `${SPACING.xxl}px` }}>
          <div className="ct-card-title" style={{ marginBottom: SPACING.md }}>
            Aucune analyse véhicule
          </div>
          <p className="ct-card-body" style={{ marginBottom: SPACING.xl }}>
            Lancez votre première analyse en remplissant le formulaire du template APM Vehicle Research.
          </p>
          <Link href={`/swarms/${APM_SWARM_ID}`} className="ct-seg-btn primary">
            Lancer une recherche <Chevron direction="right" />
          </Link>
        </div>
      )}

      {total > 0 && (
        <>
          {/* KPIs */}
          <KPIDashboard
            kpis={[
              { label: "Analyses total", value: total, accent: true },
              { label: "Complétées", value: completed },
              {
                label: "En cours / Erreurs",
                value: running + failed > 0 ? `${running} / ${failed}` : "0",
              },
              {
                label: "Tokens consommés",
                value: totalTokens > 0 ? totalTokens.toLocaleString("fr-FR") : "—",
              },
            ]}
          />

          {/* Recommendations + secondary stats */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: SPACING.lg,
              marginBottom: SPACING.xxl,
            }}
          >
            {/* Recommendations */}
            <div className="ct-card">
              <div className="ct-card-title">Répartition des recommandations</div>
              {completed === 0 ? (
                <p className="ct-placeholder">Aucune analyse terminée</p>
              ) : (
                <RecBar
                  appeler={recCounts.APPELER}
                  attendre={recCounts.ATTENDRE}
                  eviter={recCounts["ÉVITER"]}
                  unknown={recCounts.UNKNOWN}
                  total={total}
                />
              )}
            </div>

            {/* Stats secondaires */}
            <div className="ct-card">
              <div className="ct-card-title">Métriques</div>
              <div style={{ display: "flex", flexDirection: "column", gap: SPACING.sm }}>
                <Stat
                  label="Coût total"
                  value={hasCost ? `$${totalCost.toFixed(4)}` : "— (non disponible)"}
                />
                <Stat
                  label="Durée moyenne"
                  value={avgDurationMs ? fmtDuration(avgDurationMs) : "—"}
                />
                <Stat label="Tokens in" value={totalTokensIn.toLocaleString("fr-FR")} />
                <Stat label="Tokens out" value={totalTokensOut.toLocaleString("fr-FR")} />
              </div>
            </div>

            {/* Pays / Sources */}
            {(countries.length > 0 || domains.length > 0) && (
              <div className="ct-card">
                <div className="ct-card-title">Sources</div>
                {countries.length > 0 && (
                  <div style={{ marginBottom: SPACING.md }}>
                    <SectionLabel text="Pays" mb={SPACING.xs} />
                    <div style={{ display: "flex", gap: SPACING.sm, flexWrap: "wrap" }}>
                      {countries.map(([c, n]) => (
                        <span
                          key={c}
                          style={{
                            padding: `${SPACING.xs}px ${SPACING.sm}px`,
                            background: "var(--ct-surface-3)",
                            borderRadius: RADIUS.sm,
                            fontSize: FONT.xs,
                            color: "var(--ct-text-body)",
                          }}
                        >
                          {c} <span style={{ color: "var(--ct-text-muted)" }}>{n}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {domains.length > 0 && (
                  <div>
                    <SectionLabel text="Domaines" mb={SPACING.xs} />
                    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xs }}>
                      {domains.slice(0, 6).map(([d, n]) => (
                        <div
                          key={d}
                          style={{ display: "flex", justifyContent: "space-between", fontSize: FONT.sm }}
                        >
                          <span style={{ color: "var(--ct-text-body)" }}>{d}</span>
                          <span style={{ color: "var(--ct-text-muted)" }}>{n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Véhicules analysés */}
          <div style={{ marginBottom: SPACING.xxl }}>
            <SectionLabel text={`Véhicules analysés — ${total}`} />
            <div className="ct-card" style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.sm }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--ct-border)" }}>
                    <th style={thStyle}>Véhicule</th>
                    <th style={thStyle}>Prix</th>
                    <th style={thStyle}>Km</th>
                    <th style={thStyle}>Pays</th>
                    <th style={thStyle}>Statut</th>
                    <th style={thStyle}>Recommandation</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => {
                    const inp = r.inputs_json ?? {};
                    const label = getVehicleLabel(inp);
                    const rec = parseRecommendation(r.result_text);
                    const price = inp.price_eur
                      ? `${Number(inp.price_eur).toLocaleString("fr-FR")} €`
                      : "—";
                    const km = inp.mileage_km
                      ? `${Number(inp.mileage_km).toLocaleString("fr-FR")} km`
                      : "—";
                    return (
                      <tr
                        key={r.id}
                        style={{ borderBottom: "1px solid var(--ct-border-soft)" }}
                      >
                        <td style={{ ...tdStyle, fontWeight: FONT_WEIGHT.semibold }}>
                          {label}
                          {inp.fuel ? (
                            <span
                              style={{
                                marginLeft: SPACING.sm,
                                fontSize: FONT.xs,
                                color: "var(--ct-text-faint)",
                              }}
                            >
                              {String(inp.fuel)}
                            </span>
                          ) : null}
                        </td>
                        <td style={tdStyle}>{price}</td>
                        <td style={tdStyle}>{km}</td>
                        <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                          {inp.country ? String(inp.country).toUpperCase() : "—"}
                        </td>
                        <td style={tdStyle}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td style={tdStyle}>
                          <RecBadge rec={rec} />
                        </td>
                        <td style={{ ...tdStyle, color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>
                          {formatDate(r.started_at)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <Link
                            href={`/swarms/${APM_SWARM_ID}/runs/${r.id}`}
                            className="ct-link"
                            style={{ fontSize: FONT.xs }}
                          >
                            Voir <Chevron direction="right" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Activité récente — timeline */}
          <div style={{ marginBottom: SPACING.xxl }}>
            <SectionLabel text="Activité récente" />
            <div className="ct-card" style={{ padding: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.sm }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--ct-border)" }}>
                    <th style={thStyle}>Run</th>
                    <th style={thStyle}>Statut</th>
                    <th style={thStyle}>Démarré</th>
                    <th style={thStyle}>Durée</th>
                    <th style={thStyle}>Steps</th>
                    <th style={thStyle}>Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.slice(0, 15).map((r) => {
                    const dur = getDurationMs(r);
                    const label = getVehicleLabel(r.inputs_json ?? {});
                    return (
                      <tr
                        key={r.id}
                        style={{ borderBottom: "1px solid var(--ct-border-soft)" }}
                      >
                        <td style={tdStyle}>
                          <Link
                            href={`/swarms/${APM_SWARM_ID}/runs/${r.id}`}
                            className="ct-link"
                          >
                            {label}
                          </Link>
                          <div
                            style={{
                              fontSize: FONT.xs,
                              color: "var(--ct-text-faint)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {r.id.slice(0, 8)}
                          </div>
                        </td>
                        <td style={tdStyle}>
                          <StatusBadge status={r.status} />
                        </td>
                        <td style={{ ...tdStyle, color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>
                          {formatDate(r.started_at)}
                        </td>
                        <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                          {dur ? fmtDuration(dur) : "—"}
                        </td>
                        <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                          {r.steps.length}
                        </td>
                        <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                          {r.total_tokens_in + r.total_tokens_out > 0
                            ? (r.total_tokens_in + r.total_tokens_out).toLocaleString("fr-FR")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Tiny inline stat row
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: SPACING.md,
        padding: `${SPACING.xs}px 0`,
        borderBottom: "1px solid var(--ct-border-soft)",
      }}
    >
      <span style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: FONT.sm, color: "var(--ct-text-primary)", fontWeight: FONT_WEIGHT.semibold }}>
        {value}
      </span>
    </div>
  );
}
