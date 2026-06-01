import "server-only";

/**
 * client.ts — Client générique Apify (run-sync-get-dataset-items).
 *
 * Exécute un actor Apify en mode synchrone et retourne directement les items
 * du dataset de sortie. Ne lit jamais APIFY_TOKEN côté build/SSR statique —
 * la route consommatrice est `export const dynamic = "force-dynamic"`.
 */

// ─── Constantes nommées ───────────────────────────────────────────────────────

const APIFY_BASE_URL = "https://api.apify.com/v2";
const DEFAULT_TIMEOUT_MS = 120_000; // 120 s — actors AutoScout24 ~30-60 s

// ─── Erreur typée ─────────────────────────────────────────────────────────────

export class ApifyError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

// ─── Client générique ─────────────────────────────────────────────────────────

/**
 * Lance un actor Apify en mode run-sync-get-dataset-items et retourne le
 * tableau d'items du dataset.
 *
 * @param actorId  Identifiant de l'actor (ex: "blackfalcondata~autoscout24-scraper")
 * @param input    Body JSON de l'input de l'actor
 * @param options  Timeout optionnel (défaut: DEFAULT_TIMEOUT_MS)
 */
export async function runActorSync<T = unknown>(
  actorId: string,
  input: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
): Promise<T[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new ApifyError("APIFY_TOKEN manquant — variable d'environnement non définie");
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${APIFY_BASE_URL}/acts/${actorId}/run-sync-get-dataset-items`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Ne pas inclure l'URL dans le message (risque d'exposition de token)
    throw new ApifyError(`Erreur réseau Apify: ${message}`);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.error?.message ?? JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new ApifyError(`Apify HTTP ${res.status}: ${detail}`, res.status);
  }

  let items: T[];
  try {
    items = (await res.json()) as T[];
  } catch {
    throw new ApifyError("Réponse Apify non-JSON inattendue");
  }

  if (!Array.isArray(items)) {
    throw new ApifyError("Réponse Apify inattendue: tableau attendu");
  }

  return items;
}
