import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { fmtKm, fmtPrice, formatDate } from "@/lib/utils/format";
import type { SwarmRunSummary, SwarmRun } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, SPACING } from "@/lib/ui/tokens";
import { extractRecommendation, type Recommendation } from "@/lib/swarms/recommendation";
import { RecommendationBadge } from "@/components/swarms/RecommendationBadge";
import { getVehicleLabel } from "@/lib/automobile/vehicleLabel";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { BrandLogo } from "@/components/automobile/BrandLogo";
import { thStyle, tdStyle } from "@/lib/ui/tableStyles";
import { getMarketIndex, type MarketIndex } from "@/lib/market/apmClient";
import { getSourceName } from "@/lib/automobile/source";
import { DecisionBadge } from "@/components/automobile/DecisionBadge";
import { getDecisionsForRuns, type VehicleDecisionStatus } from "@/lib/automobile/decisions";
import { getEffectiveDecision, isDecisionOpen, VEHICLE_DECISION_STATUSES } from "@/lib/automobile/decisionStatus";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { AutomobileCharts, type AutomobileChartsData } from "@/components/automobile/charts/AutomobileCharts";

export const metadata = { title: "Automobile — MySwarms" };
export const dynamic = "force-dynamic";

const RUN_LIMIT = 50;
const DECISION_COUNT = 4;
const RECENT_COUNT = 12;
const MARKET_SIGNAL_COUNT = 5;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function countRecommendations(runs: SwarmRun[]): Record<Recommendation, number> {
  return runs.reduce<Record<Recommendation, number>>(
    (acc, run) => {
      acc[extractRecommendation(run.result_text)] += 1;
      return acc;
    },
    { APPELER: 0, ATTENDRE: 0, "ÉVITER": 0, UNKNOWN: 0 },
  );
}

function getVehicleKey(inputs: Record<string, unknown>): string | null {
  const make = asText(inputs.make);
  const model = asText(inputs.model);
  if (!make || !model) return null;
  return `${make} ${model}`.trim();
}

function getTopCounts(values: Array<string | null>, limit: number): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function getPriceStats(runs: SwarmRun[]): {
  count: number;
  min: number | null;
  median: number | null;
  max: number | null;
} {
  const prices = runs
    .map((run) => asNumber(run.inputs_json?.price_eur))
    .filter((price): price is number => price != null && price > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return { count: 0, min: null, median: null, max: null };
  const middle = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0
      ? (prices[middle - 1] + prices[middle]) / 2
      : prices[middle];
  return {
    count: prices.length,
    min: prices[0],
    median,
    max: prices[prices.length - 1],
  };
}

function getMarketQueries(runs: SwarmRun[]): Array<{
  key: string;
  make: string;
  model: string;
  fuel: string | null;
}> {
  const seen = new Set<string>();
  const queries: Array<{ key: string; make: string; model: string; fuel: string | null }> = [];
  for (const run of runs) {
    const make = asText(run.inputs_json?.make);
    const model = asText(run.inputs_json?.model);
    const fuel = asText(run.inputs_json?.fuel);
    if (!make || !model) continue;
    const key = `${make.toLowerCase()}|${model.toLowerCase()}|${fuel?.toLowerCase() ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push({ key, make, model, fuel });
    if (queries.length >= MARKET_SIGNAL_COUNT) break;
  }
  return queries;
}

function MetricRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: SPACING.md,
        padding: `${SPACING.sm}px 0`,
        borderBottom: "1px solid var(--ct-border-soft)",
      }}
    >
      <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.sm }}>{label}</span>
      <strong
        style={{
          color: tone === "accent" ? "var(--ct-accent-strong)" : "var(--ct-text-primary)",
          fontSize: FONT.sm,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function VehicleVisual({
  imageUrl,
  brand,
  size = 96,
}: {
  imageUrl: string | null;
  brand: string;
  size?: number;
}) {
  if (imageUrl) {
    return (
      <div
        style={{
          width: "100%",
          height: size,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--ct-border)",
          background: "var(--ct-surface-2)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: size,
        borderRadius: 14,
        border: "1px solid var(--ct-border)",
        background: "var(--ct-surface-2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <BrandLogo brand={brand} size={52} />
    </div>
  );
}

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
  let runs: SwarmRun[] = [];
  let marketSignals: Array<{
    key: string;
    label: string;
    market: MarketIndex | null;
  }> = [];
  let loadError: string | null = null;

  try {
    summaries = await swarmsClient.listRuns(AUTOMOBILE_SWARM_ID, RUN_LIMIT, ownerId);

    // Le dashboard a besoin de inputs_json + result_text pour les recommandations.
    const details = await Promise.allSettled(
      summaries.map((s) => swarmsClient.status(AUTOMOBILE_SWARM_ID, s.id, ownerId))
    );
    runs = details
      .filter((r): r is PromiseFulfilledResult<SwarmRun> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    const marketQueries = getMarketQueries(runs);
    const marketResults = await Promise.allSettled(
      marketQueries.map((query) => getMarketIndex(query.make, query.model, query.fuel)),
    );
    marketSignals = marketQueries.map((query, idx) => ({
      key: query.key,
      label: `${query.make} ${query.model}`,
      market: marketResults[idx].status === "fulfilled" ? marketResults[idx].value : null,
    }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Erreur de chargement";
  }

  // KPIs
  const total = summaries.length;
  const completed = summaries.filter((r) => r.status === "completed").length;
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const failed = summaries.filter((r) => r.status === "failed" || r.status === "cancelled").length;
  const totalTokens = summaries.reduce(
    (sum, run) => sum + run.total_tokens_in + run.total_tokens_out,
    0,
  );
  const recommendations = countRecommendations(runs);
  const recentRuns = runs.slice(0, RECENT_COUNT);

  // Décisions humaines (Map<run_id, status>) pour les pills DecisionBadge.
  const decisions: Map<string, VehicleDecisionStatus> =
    runs.length > 0
      ? await getDecisionsForRuns(ownerId, runs.map((r) => r.id))
      : new Map();

  // Runs ouverts = completed et dont la décision humaine est encore "open".
  const openRuns = runs
    .filter((run) => run.status === "completed")
    .filter((run) => isDecisionOpen(getEffectiveDecision(decisions, run.id)))
    .slice(0, DECISION_COUNT);
  const priceStats = getPriceStats(runs);
  const topVehicles = getTopCounts(runs.map((run) => getVehicleKey(run.inputs_json ?? {})), 5);
  const topSources = getTopCounts(runs.map((run) => getSourceName(asText(run.inputs_json?.source_url))), 5);
  const topCountries = getTopCounts(runs.map((run) => asText(run.inputs_json?.country)), 5);

  // ── Données visualisations live (réelles) ──────────────────────────────────
  const hasActiveRun = summaries.some((s) => s.status === "running");
  const decisionColor: Record<VehicleDecisionStatus, string> = {
    a_decider: "var(--ct-text-faint)",
    appeler: "var(--ct-accent-strong)",
    ignorer: "var(--ct-text-faint)",
    appele: "var(--ct-state-ok)",
    negociation: "var(--ct-accent-strong)",
    achete: "var(--ct-state-ok)",
    perdu: "var(--ct-alert-error-text)",
  };
  const decisionCounts = new Map<VehicleDecisionStatus, number>();
  for (const st of decisions.values()) decisionCounts.set(st, (decisionCounts.get(st) ?? 0) + 1);

  const marketByLabel = new Map(
    marketSignals.filter((m) => m.market).map((m) => [m.label, m.market!] as const),
  );
  const priceVsMarket: AutomobileChartsData["priceVsMarket"] = [];
  const seenPvm = new Set<string>();
  for (const run of recentRuns) {
    const make = asText(run.inputs_json?.make);
    const model = asText(run.inputs_json?.model);
    const price = asNumber(run.inputs_json?.price_eur);
    if (!make || !model || !price || price <= 0) continue;
    const label = `${make} ${model}`;
    const mkt = marketByLabel.get(label);
    if (
      !mkt ||
      mkt.medianPrice == null ||
      mkt.p15Price == null ||
      mkt.p85Price == null ||
      seenPvm.has(label)
    )
      continue;
    seenPvm.add(label);
    priceVsMarket.push({ label, price, p15: mkt.p15Price, median: mkt.medianPrice, p85: mkt.p85Price });
    if (priceVsMarket.length >= 5) break;
  }

  const chartsData: AutomobileChartsData = {
    total: runs.length,
    recommendations: [
      { key: "APPELER", label: "Appeler", count: recommendations.APPELER, color: "var(--ct-state-ok)" },
      { key: "ATTENDRE", label: "Attendre", count: recommendations.ATTENDRE, color: "var(--ct-accent-strong)" },
      { key: "EVITER", label: "Éviter", count: recommendations["ÉVITER"], color: "var(--ct-alert-error-text)" },
      { key: "UNKNOWN", label: "Inconnu", count: recommendations.UNKNOWN, color: "var(--ct-text-faint)" },
    ],
    decisions: VEHICLE_DECISION_STATUSES.map((s) => ({
      key: s.value,
      label: s.label,
      count: decisionCounts.get(s.value) ?? 0,
      color: decisionColor[s.value],
    })).filter((s) => s.count > 0),
    priceVsMarket,
    tokensSeries: [...recentRuns].reverse().map((r) => r.total_tokens_in + r.total_tokens_out),
    live: hasActiveRun,
  };

  return (
    <>
      {/* Refresh live tant qu'un run est en cours */}
      <AutoRefresh active={hasActiveRun} seconds={6} />

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
            Cockpit de décision pour les véhicules analysés : recommandations,
            sources, coûts tokens et rapports à traiter.
          </p>
        </div>
        <div style={{ display: "flex", gap: SPACING.sm, alignSelf: "center", flexWrap: "wrap" }}>
          <Link
            href="/automobile/canvas"
            className="ct-seg-btn"
            style={{ whiteSpace: "nowrap" }}
          >
            Canvas
          </Link>
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
            Nouvelle analyse
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
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: SPACING.lg,
            marginBottom: SPACING.xxl,
          }}
        >
          <KPICard label="Total analyses" value={total} accent />
          <KPICard label="À traiter" value={openRuns.length} />
          <KPICard label="Appeler" value={recommendations.APPELER} />
          <KPICard label="Attendre" value={recommendations.ATTENDRE} />
          <KPICard label="Éviter" value={recommendations["ÉVITER"]} />
          <KPICard label="Erreurs" value={failed} />
          <KPICard label="Succès" value={`${successRate}%`} />
          <KPICard label="Tokens" value={totalTokens.toLocaleString("fr-FR")} />
        </div>
      )}

      {/* Visualisations live */}
      {!loadError && runs.length > 0 ? (
        <div style={{ marginBottom: SPACING.xxl }}>
          <div
            style={{
              fontSize: FONT.xs,
              fontWeight: FONT_WEIGHT.bold,
              letterSpacing: LETTER_SPACING.wide,
              textTransform: "uppercase",
              color: "var(--ct-text-muted)",
              marginBottom: SPACING.md,
            }}
          >
            Visualisations
          </div>
          <AutomobileCharts data={chartsData} />
        </div>
      ) : null}

      {/* Intelligence marché */}
      {!loadError && runs.length > 0 ? (
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
              Information marché
            </span>
            <Link href="/automobile/marche" className="ct-link" style={{ fontSize: FONT.xs }}>
              Ouvrir la cote marché →
            </Link>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: SPACING.lg,
            }}
          >
            <div className="ct-card">
              <div className="ct-card-title" style={{ marginBottom: SPACING.md }}>
                Prix analysés
              </div>
              <MetricRow label="Véhicules avec prix" value={priceStats.count.toString()} />
              <MetricRow label="Prix min" value={fmtPrice(priceStats.min)} />
              <MetricRow label="Prix médian" value={fmtPrice(priceStats.median)} tone="accent" />
              <MetricRow label="Prix max" value={fmtPrice(priceStats.max)} />
            </div>

            <div className="ct-card">
              <div className="ct-card-title" style={{ marginBottom: SPACING.md }}>
                Modèles les plus vus
              </div>
              {topVehicles.length > 0 ? (
                topVehicles.map((item) => (
                  <MetricRow
                    key={item.label}
                    label={item.label}
                    value={`${item.count} fois`}
                    tone={item.count > 1 ? "accent" : "default"}
                  />
                ))
              ) : (
                <p className="ct-card-body">Pas encore assez d&apos;inputs véhicule.</p>
              )}
            </div>

            <div className="ct-card">
              <div className="ct-card-title" style={{ marginBottom: SPACING.md }}>
                Sources & pays
              </div>
              {topSources.length > 0 ? (
                topSources.map((item) => (
                  <MetricRow key={item.label} label={item.label} value={`${item.count} run(s)`} />
                ))
              ) : (
                <MetricRow label="Source" value="Non renseignée" />
              )}
              {topCountries.map((item) => (
                <MetricRow key={item.label} label={`Pays ${item.label}`} value={`${item.count} run(s)`} />
              ))}
            </div>
          </div>

          <div className="ct-card" style={{ padding: 0, overflowX: "auto", marginTop: SPACING.lg }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.sm }}>
              <thead>
                <tr>
                  <th style={thStyle}>Signal marché APM</th>
                  <th style={thStyle}>Cote médiane</th>
                  <th style={thStyle}>Fourchette</th>
                  <th style={thStyle}>Liquidité</th>
                  <th style={thStyle}>Vélocité</th>
                  <th style={thStyle}>Confiance</th>
                  <th style={thStyle}>Échantillon</th>
                </tr>
              </thead>
              <tbody>
                {marketSignals.length > 0 ? (
                  marketSignals.map(({ key, label, market }) => (
                    <tr key={key}>
                      <td style={{ ...tdStyle, fontWeight: FONT_WEIGHT.semibold, color: "var(--ct-text-primary)" }}>
                        {label}
                        {market?.fuel ? (
                          <div style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>
                            {market.fuel}
                          </div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{market ? fmtPrice(market.medianPrice) : "—"}</td>
                      <td style={tdStyle}>
                        {market ? `${fmtPrice(market.p15Price)} – ${fmtPrice(market.p85Price)}` : "—"}
                      </td>
                      <td style={tdStyle}>
                        {market?.liquidityScore != null ? market.liquidityScore.toFixed(1) : "—"}
                      </td>
                      <td style={tdStyle}>
                        {market?.marketVelocity != null && market.marketVelocity > 0
                          ? `${Math.round(market.marketVelocity)} j`
                          : "—"}
                      </td>
                      <td style={tdStyle}>
                        {market ? `${Math.round(market.confidence * 100)}%` : "—"}
                      </td>
                      <td style={tdStyle}>{market ? Math.round(market.nEffective).toString() : "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                      Aucun signal marché exploitable pour les véhicules récents.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Décisions à traiter */}
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
              À traiter maintenant
            </span>
            <Link
              href="/automobile/historique"
              className="ct-link"
              style={{ fontSize: FONT.xs }}
            >
              Historique complet →
            </Link>
          </div>

          {runs.length === 0 ? (
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
                Nouvelle analyse
              </Link>
            </div>
          ) : openRuns.length === 0 ? (
            <div className="ct-card" style={{ padding: `${SPACING.xl}px` }}>
              <div className="ct-card-title" style={{ marginBottom: SPACING.sm }}>
                Aucune décision en attente
              </div>
              <p className="ct-card-body">
                Aucune décision en attente — tous les rapports complétés ont été traités (ignoré / acheté / perdu).
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: SPACING.lg,
              }}
            >
              {openRuns.map((run) => {
                const inp = run.inputs_json ?? {};
                const label = getVehicleLabel(inp);
                const rec = extractRecommendation(run.result_text);
                const price = asNumber(inp.price_eur);
                const mileage = asNumber(inp.mileage_km);
                const sourceUrl = asText(inp.source_url);
                const brand = asText(inp.make) ?? "";
                const imageUrl = asText(inp.image_url);
                return (
                  <div
                    key={run.id}
                    className="ct-card"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: SPACING.md,
                      borderColor: rec === "APPELER" ? "var(--ct-accent-strong)" : undefined,
                    }}
                  >
                    <VehicleVisual imageUrl={imageUrl} brand={brand} />

                    <div style={{ display: "flex", alignItems: "center", gap: SPACING.md }}>
                      <BrandLogo brand={brand} size={40} />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: FONT.md,
                            fontWeight: FONT_WEIGHT.extrabold,
                            color: "var(--ct-text-primary)",
                          }}
                        >
                          {label}
                        </div>
                        <div style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>
                          {fmtPrice(price)} · {fmtKm(mileage)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: SPACING.sm, flexWrap: "wrap" }}>
                      <RecommendationBadge rec={rec} />
                      <StatusBadge status={run.status} />
                      <DecisionBadge status={decisions.get(run.id) ?? null} muteDefault />
                    </div>

                    <div style={{ display: "flex", gap: SPACING.sm, flexWrap: "wrap" }}>
                      <Link href={`/automobile/${run.id}`} className="ct-seg-btn primary">
                        Ouvrir rapport
                      </Link>
                      {sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ct-seg-btn"
                        >
                          Source
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Table dashboard */}
      {!loadError && recentRuns.length > 0 ? (
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
            <Link href="/automobile/nouvelle" className="ct-link" style={{ fontSize: FONT.xs }}>
              Analyser un véhicule →
            </Link>
          </div>

          <div className="ct-card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.sm }}>
              <thead>
                <tr>
                  <th style={thStyle}>Véhicule</th>
                  <th style={thStyle}>Recommandation</th>
                  <th style={thStyle}>Prix / KM</th>
                  <th style={thStyle}>Source</th>
                  <th style={thStyle}>Statut</th>
                  <th style={thStyle}>Décision</th>
                  <th style={thStyle}>Tokens</th>
                  <th style={thStyle}>Date</th>
                  <th style={{ ...thStyle, textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => {
                  const inp = run.inputs_json ?? {};
                  const rec = extractRecommendation(run.result_text);
                  const price = asNumber(inp.price_eur);
                  const mileage = asNumber(inp.mileage_km);
                  const fuel = asText(inp.fuel);
                  const country = asText(inp.country);
                  const sourceUrl = asText(inp.source_url);
                  const tokens = run.total_tokens_in + run.total_tokens_out;
                  return (
                    <tr key={run.id}>
                      <td style={{ ...tdStyle, minWidth: 240 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
                          <BrandLogo brand={asText(inp.make) ?? ""} size={32} />
                          <div>
                            <div
                              style={{
                                fontWeight: FONT_WEIGHT.semibold,
                                color: "var(--ct-text-primary)",
                              }}
                            >
                              {getVehicleLabel(inp)}
                            </div>
                            <div style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>
                              {[fuel, country].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <RecommendationBadge rec={rec} />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <strong style={{ color: "var(--ct-text-primary)" }}>{fmtPrice(price)}</strong>
                        <div style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>
                          {fmtKm(mileage)}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        {sourceUrl ? (
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ct-link"
                            style={{ fontSize: FONT.xs, whiteSpace: "nowrap" }}
                          >
                            Annonce ↗
                          </a>
                        ) : (
                          <span style={{ color: "var(--ct-text-faint)" }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={run.status} />
                      </td>
                      <td style={tdStyle}>
                        <DecisionBadge status={decisions.get(run.id) ?? null} muteDefault />
                      </td>
                      <td style={{ ...tdStyle, color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>
                        {tokens.toLocaleString("fr-FR")}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>
                        {formatDate(run.started_at)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <Link
                          href={`/automobile/${run.id}`}
                          className="ct-link"
                          style={{ fontSize: FONT.xs, whiteSpace: "nowrap" }}
                        >
                          Rapport →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
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
