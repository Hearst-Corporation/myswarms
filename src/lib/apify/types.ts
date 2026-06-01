/**
 * types.ts — Types partagés pour le client Apify / AutoScout24.
 * Contrat public exposé via la route POST /api/scrape/autoscout.
 */

// ─── Résultat normalisé (contrat partagé Stream A ↔ Stream B) ───────────────

export type AutoScoutListing = {
  id: string;
  title: string;
  price: number | null;     // EUR
  mileage: number | null;   // km
  year: number | null;
  fuel: string | null;
  gearbox: string | null;
  dealer: string | null;
  location: string | null;
  url: string;
  imageUrl: string | null;
};

// ─── Paramètres d'entrée de searchAutoScout() ────────────────────────────────

export type AutoScoutParams = {
  make: string;
  model?: string;
  /** Code pays ISO-2 (ex: "fr", "de", "it"). Défaut: "fr". */
  market?: string;
  priceMin?: number;
  priceMax?: number;
  /** Nombre max de résultats. Défaut: 25. Cap: 100. */
  maxResults?: number;
};

// ─── Shape brute d'un item renvoyé par l'actor blackfalcondata/autoscout24-scraper
// Smoke test du 2026-06-01 — champs observés sur la réponse réelle.

export type AutoScoutRawItem = {
  listingId?: string;
  title?: string;
  url?: string;
  portalUrl?: string;
  price?: number | null;
  currency?: string;
  mileageKm?: number | null;
  firstRegistration?: string | null; // "YYYY-MM-DD"
  fuelType?: string | null;
  transmission?: string | null;
  sellerName?: string | null;
  sellerType?: string | null;
  city?: string | null;
  country?: string | null;
  zip?: string | null;
  images?: string[];
  make?: string;
  model?: string;
  // champs supplémentaires ignorés par le normalizer
  [key: string]: unknown;
};
