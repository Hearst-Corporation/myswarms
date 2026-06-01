/**
 * prefill.ts — Pré-remplissage du formulaire `Nouvelle analyse` depuis une
 * source externe (résultat sourcing AutoScout24 → query params → formulaire).
 *
 * Deux fonctions symétriques :
 *  - `listingToPrefillHref` : côté sourcing, transforme une annonce en URL
 *    `/automobile/nouvelle?...` (write).
 *  - `parsePrefillParams` : côté nouvelle analyse, relit ces query params en ne
 *    gardant QUE les champs véhicule connus (allowlist anti-injection) (read).
 *
 * Aucun run n'est lancé automatiquement : on pré-remplit, l'humain valide.
 */
import {
  type ExtractedVehicleField,
  type FieldExtractionMeta,
  normalizeFuel,
} from "@/lib/automobile/urlExtractor";
import type { AutoScoutListing } from "@/lib/apify/types";

/**
 * Champs véhicule autorisés au pré-remplissage via query params. Allowlist
 * stricte : tout autre paramètre d'URL est ignoré (pas d'injection de clés
 * arbitraires dans `inputs_json`).
 */
const PREFILL_FIELDS: ExtractedVehicleField[] = [
  "make",
  "model",
  "year",
  "mileage_km",
  "fuel",
  "price_eur",
  "country",
  "source_url",
  "image_url",
  "notes",
];

export interface PrefillResult {
  values: Record<string, string>;
  extractedFields: Partial<Record<ExtractedVehicleField, FieldExtractionMeta>>;
}

function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Relit les query params d'une URL `/automobile/nouvelle?...` et n'en conserve
 * que les champs véhicule connus, en marquant leur provenance pour l'affichage
 * (`Pré-rempli depuis …`). Le marqueur `from=sourcing` qualifie la source.
 */
export function parsePrefillParams(
  searchParams: Record<string, string | string[] | undefined>,
): PrefillResult {
  const values: Record<string, string> = {};
  const extractedFields: PrefillResult["extractedFields"] = {};
  const from = firstParam(searchParams.from);
  const source: FieldExtractionMeta["source"] = from === "sourcing" ? "sourcing" : "url";

  for (const key of PREFILL_FIELDS) {
    const value = firstParam(searchParams[key]);
    if (!value) continue;
    values[key] = value;
    extractedFields[key] = { source, confidence: "high" };
  }

  return { values, extractedFields };
}

/**
 * Transforme une annonce AutoScout24 (+ contexte de recherche : marque, modèle,
 * marché) en lien `/automobile/nouvelle` pré-rempli. `make`/`model`/`market`
 * viennent du contexte de recherche (l'annonce normalisée ne les porte pas
 * séparément) ; les valeurs numériques et l'URL viennent de l'annonce.
 */
export function listingToPrefillHref(
  listing: AutoScoutListing,
  ctx: { make: string; model?: string; market: string },
): string {
  const params = new URLSearchParams();
  params.set("from", "sourcing");

  if (ctx.make.trim()) params.set("make", ctx.make.trim());
  if (ctx.model?.trim()) params.set("model", ctx.model.trim());
  if (listing.year != null) params.set("year", String(listing.year));
  if (listing.mileage != null) params.set("mileage_km", String(listing.mileage));

  const fuel = normalizeFuel(listing.fuel);
  if (fuel) params.set("fuel", fuel);

  if (listing.price != null) params.set("price_eur", String(listing.price));

  const country = ctx.market.trim() ? ctx.market.trim().toUpperCase().slice(0, 2) : null;
  if (country) params.set("country", country);

  if (listing.url) params.set("source_url", listing.url);
  if (listing.imageUrl) params.set("image_url", listing.imageUrl);

  return `/automobile/nouvelle?${params.toString()}`;
}
