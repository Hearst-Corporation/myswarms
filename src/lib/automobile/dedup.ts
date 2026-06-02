/**
 * dedup.ts — Déduplication *soft* par URL d'annonce (server-only).
 *
 * Objectif (stratégie V1, §7/§14) : avertir l'utilisateur si la même annonce a
 * déjà fait l'objet d'un run récent, AVANT de relancer une analyse coûteuse en
 * tokens. C'est un avertissement, pas un blocage : en cas d'échec engine la
 * fonction renvoie `null` et le flux continue normalement.
 *
 * NB : `SwarmRunSummary` ne porte pas `inputs_json` → on récupère le détail des
 * N runs les plus récents (borné par `AUTOMOBILE_DEDUP_SCAN_LIMIT`) en parallèle
 * avec un timeout court. Ce module ne doit être importé que côté serveur (il
 * dépend de `swarmsClient`).
 */
import { swarmsClient } from "@/lib/crewai/swarms";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";

const DEDUP_SCAN_LIMIT = Number(process.env.AUTOMOBILE_DEDUP_SCAN_LIMIT ?? "25");
const DEDUP_STATUS_TIMEOUT_MS = Number(
  process.env.AUTOMOBILE_DEDUP_STATUS_TIMEOUT_MS ?? "5000",
);

/** Params de query qui identifient une annonce sur certaines marketplaces. */
const ID_QUERY_PARAMS = ["id", "adId", "listingId"];

export interface DuplicateRunRef {
  runId: string;
  startedAt: string;
  status: string;
}

/**
 * Canonicalise une URL d'annonce pour comparaison : host minuscule sans `www.`,
 * pathname sans slash final, query/hash ignorés (souvent du tracking). Renvoie
 * `null` si l'URL est invalide ou non http(s).
 */
function normalizeSourceUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    // Certaines marketplaces identifient l'annonce par un param de query
    // (ex: mobile.de /details.html?id=123) plutôt que par le pathname.
    let idPart = "";
    for (const key of ID_QUERY_PARAMS) {
      const value = url.searchParams.get(key);
      if (value) {
        idPart = `?${key.toLowerCase()}=${value.toLowerCase()}`;
        break;
      }
    }
    return `${host}${path}${idPart}`.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Cherche, parmi les runs récents du propriétaire, un run dont `source_url`
 * canonicalisé correspond à `sourceUrl`. Best-effort : toute erreur engine
 * renvoie `null` (la dédup ne doit jamais empêcher de lancer une analyse).
 */
export async function findRecentRunByUrl(
  ownerId: string,
  sourceUrl: string,
  limit = DEDUP_SCAN_LIMIT,
): Promise<DuplicateRunRef | null> {
  const target = normalizeSourceUrl(sourceUrl);
  if (!target) return null;

  let summaries;
  try {
    summaries = await swarmsClient.listRuns(AUTOMOBILE_SWARM_ID, limit, ownerId, DEDUP_STATUS_TIMEOUT_MS);
  } catch {
    return null;
  }

  const details = await Promise.allSettled(
    summaries.map((s) =>
      swarmsClient.status(AUTOMOBILE_SWARM_ID, s.id, ownerId, DEDUP_STATUS_TIMEOUT_MS),
    ),
  );

  for (const detail of details) {
    if (detail.status !== "fulfilled") continue;
    const run = detail.value;
    const runUrl =
      typeof run.inputs_json?.source_url === "string" ? run.inputs_json.source_url : null;
    if (!runUrl) continue;
    if (normalizeSourceUrl(runUrl) === target) {
      return { runId: run.id, startedAt: run.started_at, status: run.status };
    }
  }

  return null;
}
