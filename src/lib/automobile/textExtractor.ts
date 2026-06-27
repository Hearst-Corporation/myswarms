/**
 * Extraction de champs véhicule depuis du TEXTE LIBRE (annonce collée).
 *
 * Complète urlExtractor.ts (qui part d'une URL scrapable) pour le cas réel où
 * le scraping est bloqué (DataDome/Cloudflare) ou l'annonce arrive en copier-
 * coller. Combine :
 *   - NER (camembert HF) → localisation, marque/organisation potentielle
 *   - règles déterministes → prix €, kilométrage, année, carburant, marque/modèle
 *     via le catalogue BRANDS (réutilisé d'urlExtractor).
 *
 * Server-only (appelle la lib HF). Fail-safe : si HF indisponible, l'extraction
 * par règles continue (NER simplement absent) — jamais de crash.
 */

import "server-only";
import { extractEntities, groupEntities } from "@/lib/hf";
import { BRANDS, getModelsForBrand } from "./brands";
import { normalizeFuel } from "./urlExtractor";

export type VehicleField =
  | "make"
  | "model"
  | "year"
  | "mileage_km"
  | "fuel"
  | "price_eur"
  | "location";

export interface TextExtractionResult {
  fields: Partial<Record<VehicleField, string>>;
  /** Entités NER regroupées (LOC/ORG/PER) — utile au debug/affichage. */
  entities: Record<string, string[]>;
  /** true si la passe NER a échoué (extraction par règles seule). */
  nerDegraded: boolean;
  warnings: string[];
}

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
const MAX_PRICE_EUR = 2_000_000;
const MAX_MILEAGE_KM = 2_000_000;

/** Prix en euros : "12 500 €", "12.500€", "12500 EUR", "€12,500". */
function extractPrice(text: string): string | undefined {
  const re = /(?:€|EUR)\s*([\d][\d\s.,]{2,})|([\d][\d\s.,]{2,})\s*(?:€|EUR|euros?)/gi;
  let best: number | undefined;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? "").replace(/[\s.,]/g, "");
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n <= MAX_PRICE_EUR) {
      // Garde le plus grand montant plausible (souvent le prix, pas une mensualité).
      if (best === undefined || n > best) best = n;
    }
  }
  return best !== undefined ? String(best) : undefined;
}

/** Kilométrage : "120 000 km", "120000km", "120.000 kms". */
function extractMileage(text: string): string | undefined {
  const re = /([\d][\d\s.]{2,})\s*km\b/gi;
  let best: number | undefined;
  for (const m of text.matchAll(re)) {
    const n = Number((m[1] ?? "").replace(/[\s.]/g, ""));
    if (Number.isFinite(n) && n > 0 && n <= MAX_MILEAGE_KM) {
      if (best === undefined || n > best) best = n;
    }
  }
  return best !== undefined ? String(best) : undefined;
}

/** Année (4 chiffres plausibles) — préfère un "mise en circulation" proche. */
function extractYear(text: string): string | undefined {
  const re = /\b(19\d{2}|20\d{2})\b/g;
  const years: number[] = [];
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]);
    if (n >= MIN_YEAR && n <= MAX_YEAR) years.push(n);
  }
  if (years.length === 0) return undefined;
  // Heuristique : la plus récente année plausible (souvent l'année du véhicule).
  return String(Math.max(...years));
}

/** Carburant via le vocabulaire FR courant, normalisé par urlExtractor. */
function extractFuel(text: string): string | undefined {
  const lowered = text.toLowerCase();
  for (const kw of ["diesel", "essence", "électrique", "electrique", "hybride", "gpl", "gnv"]) {
    if (lowered.includes(kw)) {
      const norm = normalizeFuel(kw);
      if (norm) return norm;
    }
  }
  return undefined;
}

/** Marque + modèle via le catalogue BRANDS (insensible à la casse). */
function extractMakeModel(text: string): { make?: string; model?: string } {
  const lowered = text.toLowerCase();
  for (const entry of BRANDS) {
    if (lowered.includes(entry.brand.toLowerCase())) {
      // Cherche un modèle de cette marque mentionné dans le texte.
      const models = getModelsForBrand(entry.brand);
      const model = models.find((mdl) => mdl && lowered.includes(mdl.toLowerCase()));
      return { make: entry.brand, ...(model ? { model } : {}) };
    }
  }
  return {};
}

/**
 * Extrait les champs véhicule d'un texte d'annonce.
 * `text` doit être borné par l'appelant (taille). NER best-effort.
 */
export async function extractVehicleFromText(
  text: string,
  opts?: { signal?: AbortSignal },
): Promise<TextExtractionResult> {
  const warnings: string[] = [];
  const fields: Partial<Record<VehicleField, string>> = {};

  // 1. Règles déterministes (ne dépendent pas de HF).
  const price = extractPrice(text);
  if (price) fields.price_eur = price;
  const mileage = extractMileage(text);
  if (mileage) fields.mileage_km = mileage;
  const year = extractYear(text);
  if (year) fields.year = year;
  const fuel = extractFuel(text);
  if (fuel) fields.fuel = fuel;
  const { make, model } = extractMakeModel(text);
  if (make) fields.make = make;
  if (model) fields.model = model;

  // 2. NER (best-effort) — localisation, et marque de secours via ORG.
  let entities: Record<string, string[]> = {};
  let nerDegraded = false;
  try {
    const ents = await extractEntities(text, { variant: "fr", signal: opts?.signal });
    entities = groupEntities(ents);
    const loc = entities.LOC?.[0];
    if (loc) fields.location = loc;
    // Si aucune marque trouvée par règles, tente via une ORG reconnue dans le catalogue.
    if (!fields.make) {
      for (const org of entities.ORG ?? []) {
        const match = BRANDS.find((b) => b.brand.toLowerCase() === org.toLowerCase());
        if (match) {
          fields.make = match.brand;
          break;
        }
      }
    }
  } catch {
    nerDegraded = true;
    warnings.push("NER indisponible — extraction par règles uniquement.");
  }

  if (Object.keys(fields).length === 0) {
    warnings.push("Aucun champ véhicule détecté dans le texte.");
  }

  return { fields, entities, nerDegraded, warnings };
}
