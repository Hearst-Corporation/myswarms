import { z } from "zod";
import {
  authedFetch,
  ENGINE_TOKEN,
  EngineError,
  handleResponse,
  logWarning,
} from "./_internal";

// Guard boot-time — SSR-safe (logWarning ne fait rien côté client).
if (!ENGINE_TOKEN) {
  logWarning(
    "[crewai/listings] CREWAI_ENGINE_AUTH_TOKEN missing — calls will fail with 401",
  );
}

/**
 * Requête de recherche d'annonces immobilières (vente).
 * Alias camelCase imposés par l'engine (`ListingsRequest` côté Python).
 * Tous les champs sont optionnels — l'engine fait du best-effort.
 */
export const ListingsQuerySchema = z.object({
  ville: z.string().min(1).max(120).optional(),
  codePostal: z.string().min(1).max(10).optional(),
  typeBien: z.enum(["appartement", "maison"]).optional(),
  surface: z.number().positive().max(100000).optional(),
  nbPieces: z.number().positive().max(50).optional(),
});

export type ListingsQuery = z.infer<typeof ListingsQuerySchema>;

const ListingItemSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  price_eur: z.number(),
  surface_m2: z.number(),
  price_per_sqm: z.number().nullable().optional(),
  rooms: z.number().nullable().optional(),
  published_at: z.string().nullable().optional(),
  status: z.string(),
  sale_type: z.string(),
});

const ListingsResponseSchema = z.object({
  listings: z.array(ListingItemSchema),
});

export type ListingItem = z.infer<typeof ListingItemSchema>;
export type ListingsResponse = z.infer<typeof ListingsResponseSchema>;

/**
 * Erreur typée des appels listings (alias rétrocompatible de EngineError).
 */
export class ListingsEngineError extends EngineError {
  constructor(status: number, path: string, message: string) {
    super(status, path, message);
    this.name = "ListingsEngineError";
  }
}

const LISTINGS_PATH = "/v1/listings";

/**
 * Client engine pour le scrape synchrone d'annonces immobilières.
 *
 * `ownerId` est REQUIS : l'endpoint engine `/v1/listings` est désormais
 * owner-scopé (Depends(require_internal_identity)). Passer `ownerId` à
 * `authedFetch` déclenche l'émission du JWT interne `X-Internal-Auth` ; sans lui
 * l'engine répond 401. Aucun fallback non-scopé.
 */
export const listingsClient = {
  async search(
    query: ListingsQuery,
    ownerId: string,
    opts: { timeoutMs?: number } = {},
  ): Promise<ListingsResponse> {
    const parsed = ListingsQuerySchema.parse(query);
    const res = await authedFetch(
      LISTINGS_PATH,
      { method: "POST", body: JSON.stringify(parsed) },
      opts.timeoutMs,
      ownerId,
    );
    const data = await handleResponse(res, LISTINGS_PATH, "[crewai/listings]");
    return ListingsResponseSchema.parse(data);
  },
};
