/**
 * Client lecture **read-only** de l'intelligence marché du moteur APM.
 *
 * FRONTIÈRE STRICTE — DATA ONLY : ce module interroge uniquement la table
 * `market_index` de la base Supabase d'APM (projet ipgqjrsvcqqmnihasxae). Aucun
 * code, composant, route ou asset frontend d'APM n'est importé ici. Le seul pont
 * entre les deux projets, ce sont des nombres (cote, liquidité, momentum).
 *
 * Fail-soft : toute erreur (APM injoignable, timeout, aucun cluster) → `null`.
 * L'analyse véhicule ne doit JAMAIS casser si la donnée marché est absente.
 */

const APM_URL = process.env.APM_MARKET_SUPABASE_URL;
const APM_KEY = process.env.APM_MARKET_SUPABASE_KEY;
const TIMEOUT_MS = Number(process.env.APM_MARKET_TIMEOUT_MS ?? "5000");
const MIN_EFFECTIVE = Number(process.env.APM_MARKET_MIN_EFFECTIVE ?? "3");

export interface MarketIndex {
  make: string;
  model: string;
  fuel: string | null;
  medianPrice: number | null;
  p15Price: number | null;
  p85Price: number | null;
  marketVelocity: number | null;
  liquidityScore: number | null;
  heatScore: number | null;
  nEffective: number;
  confidence: number;
  asOf: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/**
 * Candidats de modèle pour matcher la normalisation d'APM.
 * APM normalise en code de série : "330d xDrive" → "330", "Golf GTI" → "golf".
 * On génère donc : modèle complet, premier token, et code à 3 chiffres si présent.
 */
function modelCandidates(model: string): string[] {
  const n = norm(model);
  const set = new Set<string>([n]);
  const first = n.split(/\s+/)[0];
  if (first) set.add(first);
  const code = n.match(/\d{3}/)?.[0];
  if (code) set.add(code);
  return [...set];
}

/**
 * Récupère le cluster marché le plus pertinent pour un véhicule.
 * Matche `make` exact + `model` souple (contient), garde le cluster le plus
 * peuplé et le plus récent. Filtre optionnel sur le carburant.
 */
export async function getMarketIndex(
  make: string,
  model: string,
  fuel?: string | null,
): Promise<MarketIndex | null> {
  if (!APM_URL || !APM_KEY || !make?.trim() || !model?.trim()) return null;

  const cands = modelCandidates(model);
  const first = cands[1] ?? cands[0];
  // OR : modèle exact (un des candidats) OU contient le premier token.
  const orClause = `(${cands.map((c) => `model.eq.${c}`).join(",")},model.ilike.*${first}*)`;

  // Carburant = préférence souple : on tente d'abord avec, puis sans (le cluster
  // peuplé d'un modèle peut être dans un autre carburant). Le carburant réellement
  // matché est toujours renvoyé pour que l'analyse repère un écart.
  return (
    (fuel?.trim() ? await queryOne(orClause, norm(make), norm(fuel)) : null) ??
    (await queryOne(orClause, norm(make), null))
  );
}

async function queryOne(
  orClause: string,
  make: string,
  fuel: string | null,
): Promise<MarketIndex | null> {
  const params = new URLSearchParams({
    select:
      "make,model,fuel,median_price,p15_price,p85_price,market_velocity,liquidity_score,heat_score,n_effective,confidence,as_of",
    make: `eq.${make}`,
    or: orClause,
    median_price: "not.is.null",
    n_effective: `gte.${MIN_EFFECTIVE}`,
    order: "n_effective.desc,as_of.desc",
    limit: "1",
  });
  if (fuel) params.append("fuel", `eq.${fuel}`);

  try {
    const res = await fetch(`${APM_URL}/rest/v1/market_index?${params.toString()}`, {
      headers: { apikey: APM_KEY!, Authorization: `Bearer ${APM_KEY}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    const r = rows[0];
    if (!r) return null;
    return {
      make: String(r.make ?? ""),
      model: String(r.model ?? ""),
      fuel: r.fuel ? String(r.fuel) : null,
      medianPrice: num(r.median_price),
      p15Price: num(r.p15_price),
      p85Price: num(r.p85_price),
      marketVelocity: num(r.market_velocity),
      liquidityScore: num(r.liquidity_score),
      heatScore: num(r.heat_score),
      nEffective: Number(r.n_effective ?? 0),
      confidence: Number(r.confidence ?? 0),
      asOf: String(r.as_of ?? ""),
    };
  } catch {
    return null;
  }
}
