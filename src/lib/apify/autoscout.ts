import "server-only";

/**
 * autoscout.ts — Wrapper AutoScout24 Apify.
 *
 * Actor: blackfalcondata/autoscout24-scraper
 * ID API: blackfalcondata~autoscout24-scraper
 *
 * ─── Mapping params → input actor (confirmé smoke test 2026-06-01) ───────────
 *
 * Notre paramètre      → Champ actor         Notes
 * ─────────────────────────────────────────────────────────────────────────────
 * market (ex: "fr")    → countries: ["FR"]   ISO-2 uppercased, tableau
 * make                 → make: string         ex: "bmw" — l'actor accepte minuscules
 * model                → model: string        optionnel
 * priceMin             → priceFrom: number    champ observé, optionnel
 * priceMax             → priceTo: number      champ observé, optionnel
 * maxResults (cap 100) → maxResults: number   contrôlé localement
 * (fixe)               → includeDetails: true requis pour transmission/city/images
 *
 * ─── Champs bruts → AutoScoutListing (smoke test, item réel) ─────────────────
 *
 * listingId          → id
 * title              → title
 * price              → price           (EUR, déjà en number ou null)
 * mileageKm          → mileage
 * firstRegistration  → year            (extrait l'année depuis "YYYY-MM-DD")
 * fuelType           → fuel
 * transmission       → gearbox
 * sellerName         → dealer
 * city               → location        (+ country en fallback)
 * url | portalUrl    → url
 * images[0]          → imageUrl
 */

import { runActorSync } from "./client";
import type { AutoScoutListing, AutoScoutParams, AutoScoutRawItem } from "./types";

const ACTOR_ID = "blackfalcondata~autoscout24-scraper";
export const MAX_RESULTS_CAP = 100;
const DEFAULT_MARKET = "fr";
export const DEFAULT_MAX_RESULTS = 25;

// ─── Constantes cache & validation ───────────────────────────────────────────

const CACHE_TTL_SECONDS = 300; // 5 minutes
const MIN_VEHICLE_YEAR = 1900;

// ─── Cache Upstash Redis REST (graceful — jamais de crash si absent) ─────────

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function cacheGet(key: string): Promise<string | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result: string | null };
    return json.result ?? null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: string): Promise<void> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  try {
    await fetch(
      `${UPSTASH_URL}/set/${encodeURIComponent(key)}?EX=${CACHE_TTL_SECONDS}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: value,
      },
    );
  } catch {
    // Graceful — on ignore l'échec d'écriture cache
  }
}

function buildCacheKey(params: AutoScoutParams): string {
  const make = (params.make ?? "").toLowerCase();
  const model = (params.model ?? "").toLowerCase();
  const market = (params.market ?? DEFAULT_MARKET).toLowerCase();
  const priceMin = params.priceMin ?? "";
  const priceMax = params.priceMax ?? "";
  const maxResults = params.maxResults ?? DEFAULT_MAX_RESULTS;
  return `autoscout:${make}|${model}|${market}|${priceMin}|${priceMax}|${maxResults}`;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function extractYear(firstRegistration: string | null | undefined): number | null {
  if (!firstRegistration) return null;
  const year = parseInt(firstRegistration.substring(0, 4), 10);
  if (isNaN(year)) return null;
  const currentYear = new Date().getFullYear();
  if (year < MIN_VEHICLE_YEAR || year > currentYear + 1) return null;
  return year;
}

function normalizeItem(raw: AutoScoutRawItem): AutoScoutListing {
  const locationParts = [raw.city, raw.country].filter(Boolean);
  return {
    id: raw.listingId ?? crypto.randomUUID(),
    title: raw.title ?? "",
    price: typeof raw.price === "number" ? raw.price : null,
    mileage: typeof raw.mileageKm === "number" ? raw.mileageKm : null,
    year: extractYear(raw.firstRegistration),
    fuel: raw.fuelType ?? null,
    gearbox: raw.transmission ?? null,
    dealer: raw.sellerName ?? null,
    location: locationParts.length > 0 ? locationParts.join(", ") : null,
    url: raw.url ?? raw.portalUrl ?? "",
    imageUrl: Array.isArray(raw.images) && raw.images.length > 0 ? raw.images[0] : null,
  };
}

// ─── Fonction publique ────────────────────────────────────────────────────────

export async function searchAutoScout(
  params: AutoScoutParams,
): Promise<AutoScoutListing[]> {
  const cappedMax = Math.min(
    params.maxResults ?? DEFAULT_MAX_RESULTS,
    MAX_RESULTS_CAP,
  );

  // ─── Cache Upstash (graceful) ─────────────────────────────────────────────
  const cacheKey = buildCacheKey({ ...params, maxResults: cappedMax });
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as AutoScoutListing[];
    } catch {
      // Cache corrompu — on ignore et on continue vers l'actor
    }
  }

  // Mapping params → input actor (cf. commentaire en-tête)
  const actorInput: Record<string, unknown> = {
    countries: [(params.market ?? DEFAULT_MARKET).toUpperCase()],
    make: params.make,
    maxResults: cappedMax,
    includeDetails: true,
  };
  if (params.model) actorInput.model = params.model;
  if (params.priceMin != null) actorInput.priceFrom = params.priceMin;
  if (params.priceMax != null) actorInput.priceTo = params.priceMax;

  const rawItems = await runActorSync<AutoScoutRawItem>(ACTOR_ID, actorInput);
  const listings = rawItems.map(normalizeItem);

  // Mise en cache (graceful — échec ignoré)
  await cacheSet(cacheKey, JSON.stringify(listings));

  return listings;
}
