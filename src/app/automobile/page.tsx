import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { fmtKm, fmtPrice, formatDate } from "@/lib/utils/format";
import type { SwarmRunSummary, SwarmRun } from "@/lib/forms/swarmSchemas";
import { extractRecommendation, type Recommendation } from "@/lib/swarms/recommendation";
import { RecommendationBadge } from "@/components/swarms/RecommendationBadge";
import { getVehicleLabel } from "@/lib/automobile/vehicleLabel";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { BrandLogo } from "@/components/automobile/BrandLogo";
import { LinkButton } from "@/components/automobile/LinkButton";
import {
  Card,
  CardBody,
  PageHeader,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
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
    <div className="flex justify-between gap-4 border-b border-line py-2">
      <span className="text-sm text-content-muted">{label}</span>
      <strong
        className={`whitespace-nowrap text-sm ${tone === "accent" ? "text-accent-strong" : "text-content-strong"}`}
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
        className="w-full overflow-hidden rounded-[var(--radius-lg)] bg-surface-2 ring-1 ring-inset ring-line"
        style={{ height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="block h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className="flex w-full items-center justify-center rounded-[var(--radius-lg)] bg-surface-2 ring-1 ring-inset ring-line"
      style={{ height: size }}
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
    a_decider: "var(--color-content-faint)",
    appeler: "var(--color-accent-strong)",
    ignorer: "var(--color-content-faint)",
    appele: "var(--color-ok)",
    negociation: "var(--color-accent-strong)",
    achete: "var(--color-ok)",
    perdu: "var(--color-danger)",
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
      { key: "APPELER", label: "Appeler", count: recommendations.APPELER, color: "var(--color-ok)" },
      { key: "ATTENDRE", label: "Attendre", count: recommendations.ATTENDRE, color: "var(--color-accent-strong)" },
      { key: "EVITER", label: "Éviter", count: recommendations["ÉVITER"], color: "var(--color-danger)" },
      { key: "UNKNOWN", label: "Inconnu", count: recommendations.UNKNOWN, color: "var(--color-content-faint)" },
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
      <PageHeader
        className="mb-10"
        eyebrow="Cockpit · MySwarms"
        title="Analyse Automobile"
        subtitle="Cockpit de décision pour les véhicules analysés : recommandations, sources, coûts tokens et rapports à traiter."
        actions={
          <>
            <LinkButton href="/automobile/canvas" variant="secondary">
              Canvas
            </LinkButton>
            <LinkButton href="/automobile/marche" variant="secondary">
              Cote marché
            </LinkButton>
            <LinkButton href="/automobile/nouvelle" variant="primary">
              Nouvelle analyse
            </LinkButton>
          </>
        }
      />

      {/* Error */}
      {loadError && (
        <div
          role="alert"
          className="mb-6 mt-8 rounded-[var(--radius-lg)] bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/25"
        >
          Engine indisponible — {loadError}
        </div>
      )}

      {/* KPIs */}
      {!loadError && (
        <div className="mb-10 mt-8 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-6">
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
        <div className="mb-10">
          <div className="mb-4 text-xs font-bold uppercase tracking-wider text-content-muted">
            Visualisations
          </div>
          <AutomobileCharts data={chartsData} />
        </div>
      ) : null}

      {/* Intelligence marché */}
      {!loadError && runs.length > 0 ? (
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-content-muted">
              Information marché
            </span>
            <Link
              href="/automobile/marche"
              className="text-xs font-medium text-accent hover:text-accent-strong"
            >
              Ouvrir la cote marché →
            </Link>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
            <Card>
              <CardBody>
                <h3 className="mb-4 text-sm font-semibold text-content-strong">Prix analysés</h3>
                <MetricRow label="Véhicules avec prix" value={priceStats.count.toString()} />
                <MetricRow label="Prix min" value={fmtPrice(priceStats.min)} />
                <MetricRow label="Prix médian" value={fmtPrice(priceStats.median)} tone="accent" />
                <MetricRow label="Prix max" value={fmtPrice(priceStats.max)} />
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <h3 className="mb-4 text-sm font-semibold text-content-strong">
                  Modèles les plus vus
                </h3>
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
                  <p className="text-sm text-content-muted">Pas encore assez d&apos;inputs véhicule.</p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <h3 className="mb-4 text-sm font-semibold text-content-strong">Sources &amp; pays</h3>
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
              </CardBody>
            </Card>
          </div>

          <div className="mt-6">
            <Table>
              <THead>
                <TR>
                  <TH>Signal marché APM</TH>
                  <TH>Cote médiane</TH>
                  <TH>Fourchette</TH>
                  <TH>Liquidité</TH>
                  <TH>Vélocité</TH>
                  <TH>Confiance</TH>
                  <TH>Échantillon</TH>
                </TR>
              </THead>
              <TBody>
                {marketSignals.length > 0 ? (
                  marketSignals.map(({ key, label, market }) => (
                    <TR key={key}>
                      <TD className="font-semibold text-content-strong">
                        {label}
                        {market?.fuel ? (
                          <div className="text-xs text-content-faint">{market.fuel}</div>
                        ) : null}
                      </TD>
                      <TD>{market ? fmtPrice(market.medianPrice) : "—"}</TD>
                      <TD>
                        {market ? `${fmtPrice(market.p15Price)} – ${fmtPrice(market.p85Price)}` : "—"}
                      </TD>
                      <TD>
                        {market?.liquidityScore != null ? market.liquidityScore.toFixed(1) : "—"}
                      </TD>
                      <TD>
                        {market?.marketVelocity != null && market.marketVelocity > 0
                          ? `${Math.round(market.marketVelocity)} j`
                          : "—"}
                      </TD>
                      <TD>{market ? `${Math.round(market.confidence * 100)}%` : "—"}</TD>
                      <TD>{market ? Math.round(market.nEffective).toString() : "—"}</TD>
                    </TR>
                  ))
                ) : (
                  <TR>
                    <TD colSpan={7} className="text-content-muted">
                      Aucun signal marché exploitable pour les véhicules récents.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </div>
      ) : null}

      {/* Décisions à traiter */}
      {!loadError && (
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-content-muted">
              À traiter maintenant
            </span>
            <Link
              href="/automobile/historique"
              className="text-xs font-medium text-accent hover:text-accent-strong"
            >
              Historique complet →
            </Link>
          </div>

          {runs.length === 0 ? (
            <Card>
              <CardBody className="py-12 text-center">
                <h3 className="mb-4 text-sm font-semibold text-content-strong">
                  Aucune analyse pour le moment
                </h3>
                <p className="mb-8 text-sm text-content-muted">
                  Lancez votre première analyse pour obtenir un rapport détaillé sur un véhicule.
                </p>
                <LinkButton href="/automobile/nouvelle" variant="primary">
                  Nouvelle analyse
                </LinkButton>
              </CardBody>
            </Card>
          ) : openRuns.length === 0 ? (
            <Card>
              <CardBody>
                <h3 className="mb-2 text-sm font-semibold text-content-strong">
                  Aucune décision en attente
                </h3>
                <p className="text-sm text-content-muted">
                  Aucune décision en attente — tous les rapports complétés ont été traités (ignoré / acheté / perdu).
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6">
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
                  <Card
                    key={run.id}
                    className={rec === "APPELER" ? "ring-accent/60" : undefined}
                  >
                    <CardBody className="flex flex-col gap-4">
                      <VehicleVisual imageUrl={imageUrl} brand={brand} />

                      <div className="flex items-center gap-4">
                        <BrandLogo brand={brand} size={40} />
                        <div className="min-w-0">
                          <div className="text-base font-extrabold text-content-strong">
                            {label}
                          </div>
                          <div className="text-xs text-content-faint">
                            {fmtPrice(price)} · {fmtKm(mileage)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <RecommendationBadge rec={rec} />
                        <StatusBadge status={run.status} />
                        <DecisionBadge status={decisions.get(run.id) ?? null} muteDefault />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <LinkButton href={`/automobile/${run.id}`} variant="primary">
                          Ouvrir rapport
                        </LinkButton>
                        {sourceUrl ? (
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-surface-3 px-4 text-sm font-semibold text-content ring-1 ring-inset ring-line transition-colors hover:bg-elevated"
                          >
                            Source
                          </a>
                        ) : null}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Table dashboard */}
      {!loadError && recentRuns.length > 0 ? (
        <div className="mb-10">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-content-muted">
              Analyses récentes
            </span>
            <Link
              href="/automobile/nouvelle"
              className="text-xs font-medium text-accent hover:text-accent-strong"
            >
              Analyser un véhicule →
            </Link>
          </div>

          <Table>
            <THead>
              <TR>
                <TH>Véhicule</TH>
                <TH>Recommandation</TH>
                <TH>Prix / KM</TH>
                <TH>Source</TH>
                <TH>Statut</TH>
                <TH>Décision</TH>
                <TH>Tokens</TH>
                <TH>Date</TH>
                <TH className="text-right" />
              </TR>
            </THead>
            <TBody>
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
                  <TR key={run.id}>
                    <TD className="min-w-[240px]">
                      <div className="flex items-center gap-2">
                        <BrandLogo brand={asText(inp.make) ?? ""} size={32} />
                        <div>
                          <div className="font-semibold text-content-strong">
                            {getVehicleLabel(inp)}
                          </div>
                          <div className="text-xs text-content-faint">
                            {[fuel, country].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <RecommendationBadge rec={rec} />
                    </TD>
                    <TD className="whitespace-nowrap">
                      <strong className="text-content-strong">{fmtPrice(price)}</strong>
                      <div className="text-xs text-content-faint">{fmtKm(mileage)}</div>
                    </TD>
                    <TD>
                      {sourceUrl ? (
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="whitespace-nowrap text-xs font-medium text-accent hover:text-accent-strong"
                        >
                          Annonce ↗
                        </a>
                      ) : (
                        <span className="text-content-faint">—</span>
                      )}
                    </TD>
                    <TD>
                      <StatusBadge status={run.status} />
                    </TD>
                    <TD>
                      <DecisionBadge status={decisions.get(run.id) ?? null} muteDefault />
                    </TD>
                    <TD className="whitespace-nowrap text-content-muted">
                      {tokens.toLocaleString("fr-FR")}
                    </TD>
                    <TD className="whitespace-nowrap text-content-muted">
                      {formatDate(run.started_at)}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/automobile/${run.id}`}
                        className="whitespace-nowrap text-xs font-medium text-accent hover:text-accent-strong"
                      >
                        Rapport →
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
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
      className={`rounded-[var(--radius-lg)] bg-surface p-5 shadow-sm shadow-black/20 ring-1 ring-inset ${accent ? "ring-accent/60" : "ring-line"}`}
    >
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-content-muted">
        {label}
      </div>
      <div
        className={`text-3xl font-extrabold leading-none ${accent ? "text-accent-strong" : "text-content-strong"}`}
      >
        {value}
      </div>
    </div>
  );
}
