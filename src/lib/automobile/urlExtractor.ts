import { BRANDS } from "@/lib/automobile/brands";

export type ExtractedVehicleField =
  | "make"
  | "model"
  | "year"
  | "mileage_km"
  | "fuel"
  | "price_eur"
  | "country"
  | "source_url"
  | "image_url"
  | "notes";

type ExtractionSource = "json-ld" | "meta" | "text" | "url" | "fallback" | "sourcing";
type ExtractionConfidence = "high" | "medium" | "low";

export interface FieldExtractionMeta {
  source: ExtractionSource;
  confidence: ExtractionConfidence;
}

export interface VehicleUrlExtraction {
  fields: Partial<Record<ExtractedVehicleField, string>>;
  extractedFields: Partial<Record<ExtractedVehicleField, FieldExtractionMeta>>;
  warnings: string[];
}

const EXTRACTION_TIMEOUT_MS = Number(process.env.AUTOMOBILE_URL_EXTRACT_TIMEOUT_MS ?? "8000");
const MAX_HTML_BYTES = Number(process.env.AUTOMOBILE_URL_EXTRACT_MAX_HTML_BYTES ?? "1000000");
const MIN_YEAR = 1900;
const MAX_PRICE_EUR = 2_000_000;
const MAX_MILEAGE_KM = 1_500_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; MySwarmsAutomobileExtractor/1.0; +https://myswarms.app)";

const DOMAIN_RULES: Array<{ pattern: RegExp; country?: string }> = [
  { pattern: /(^|\.)autoscout24\.(fr|de|it|es|nl|be|at|ch|com)$/ },
  { pattern: /(^|\.)mobile\.de$/, country: "DE" },
  { pattern: /(^|\.)leboncoin\.fr$/, country: "FR" },
  { pattern: /(^|\.)la-centrale\.fr$/, country: "FR" },
  { pattern: /(^|\.)lacentrale\.fr$/, country: "FR" },
  { pattern: /(^|\.)subito\.it$/, country: "IT" },
  { pattern: /(^|\.)milanuncios\.com$/, country: "ES" },
  { pattern: /(^|\.)coches\.net$/, country: "ES" },
];

const COUNTRY_BY_TLD: Record<string, string> = {
  fr: "FR",
  de: "DE",
  it: "IT",
  es: "ES",
  nl: "NL",
  be: "BE",
  at: "AT",
  ch: "CH",
};

const FUEL_ALIASES: Array<{ value: string; pattern: RegExp }> = [
  { value: "électrique", pattern: /\b(electric|electrique|électrique|bev|ev)\b/i },
  { value: "hybride", pattern: /\b(hybrid|hybride|phev|plug-?in)\b/i },
  { value: "diesel", pattern: /\b(diesel|gazole|gasoil)\b/i },
  { value: "essence", pattern: /\b(petrol|gasoline|essence|benzin|super)\b/i },
];

function setField(
  result: VehicleUrlExtraction,
  key: ExtractedVehicleField,
  value: string | number | null | undefined,
  source: ExtractionSource,
  confidence: ExtractionConfidence,
) {
  if (value == null) return;
  const normalized = String(value).trim();
  if (!normalized || result.fields[key]) return;
  result.fields[key] = normalized;
  result.extractedFields[key] = { source, confidence };
}

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(html: string): string {
  return normalizeSpace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'");
}

function getMetaContent(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return null;
}

function getImageFromJsonLd(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) return getImageFromJsonLd(value[0]);
  if (isRecord(value)) {
    const url = value.url;
    if (typeof url === "string" && url.trim()) return url;
  }
  return null;
}

function getTitle(html: string): string | null {
  const ogTitle = getMetaContent(html, "og:title");
  if (ogTitle) return ogTitle;
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return title ? decodeHtmlEntities(stripTags(title)) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function collectJsonLdObjects(value: unknown, out: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdObjects(item, out);
    return out;
  }
  if (!isRecord(value)) return out;
  out.push(value);
  if (Array.isArray(value["@graph"])) collectJsonLdObjects(value["@graph"], out);
  return out;
}

function getNestedString(value: unknown, keys: string[]): string | null {
  let cur = value;
  for (const key of keys) {
    if (!isRecord(cur)) return null;
    cur = cur[key];
  }
  if (typeof cur === "string") return cur;
  if (typeof cur === "number") return String(cur);
  return null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return null;
}

function parseJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try {
      const raw = decodeHtmlEntities(match[1] ?? "").trim();
      if (!raw) continue;
      collectJsonLdObjects(JSON.parse(raw), out);
    } catch {
      // JSON-LD cassé côté marketplace : on continue avec meta/text.
    }
  }
  return out;
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function extractYear(text: string): string | null {
  const currentYear = new Date().getFullYear();
  for (const match of text.matchAll(/\b(19\d{2}|20\d{2})\b/g)) {
    const year = Number(match[1]);
    if (year >= MIN_YEAR && year <= currentYear + 1) return String(year);
  }
  return null;
}

function extractMileage(text: string): string | null {
  const match = /(\d{1,3}(?:[ .]\d{3})+|\d{4,7})\s*(?:km|kilom[eè]tres?|kilometer)/i.exec(text);
  if (!match?.[1]) return null;
  const mileage = Number(match[1].replace(/\D/g, ""));
  if (!Number.isFinite(mileage) || mileage < 0 || mileage > MAX_MILEAGE_KM) return null;
  return String(mileage);
}

function extractPrice(text: string): string | null {
  const patterns = [
    /(?:€|eur)\s*(\d{1,3}(?:[ .]\d{3})+|\d{3,7})(?:[,.]\d{2})?/i,
    /(\d{1,3}(?:[ .]\d{3})+|\d{3,7})(?:[,.]\d{2})?\s*(?:€|eur)/i,
  ];
  for (const pattern of patterns) {
    const raw = pattern.exec(text)?.[1];
    if (!raw) continue;
    const price = Number(raw.replace(/\D/g, ""));
    if (Number.isFinite(price) && price > 0 && price <= MAX_PRICE_EUR) return String(price);
  }
  return null;
}

function extractFuel(text: string): string | null {
  return FUEL_ALIASES.find((fuel) => fuel.pattern.test(text))?.value ?? null;
}

/**
 * Normalise un libellé de carburant brut (issu d'une source externe : sourcing
 * AutoScout24, saisie, etc.) vers la valeur canonique du formulaire
 * (`essence` | `diesel` | `hybride` | `électrique`). Retourne `null` si aucune
 * correspondance — l'appelant laisse alors le champ vide plutôt que d'injecter
 * une valeur hors-référentiel dans le `<select>`.
 */
export function normalizeFuel(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  return extractFuel(raw);
}

function inferCountry(url: URL, text?: string): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const rule = DOMAIN_RULES.find((candidate) => candidate.pattern.test(host));
  if (rule?.country) return rule.country;
  const tld = host.split(".").at(-1);
  if (tld && COUNTRY_BY_TLD[tld]) return COUNTRY_BY_TLD[tld];
  const countryMatch = /\b(FR|DE|IT|ES|BE|NL|AT|CH|PT|GB)\b/.exec(text ?? "");
  return countryMatch?.[1] ?? null;
}

function inferMakeModel(text: string): { make?: string; model?: string } {
  const normalized = normalizeSpace(text);
  for (const entry of BRANDS) {
    const pattern = new RegExp(`\\b${entry.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const match = pattern.exec(normalized);
    if (!match) continue;
    const after = normalized.slice(match.index + match[0].length).trim();
    const tokens = after
      .split(/[|,;:()[\]\-–—]/)[0]
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);
    const model = tokens
      .filter((token) => !/^(19\d{2}|20\d{2}|€|eur|km)$/i.test(token))
      .join(" ")
      .trim();
    return { make: entry.brand, ...(model ? { model } : {}) };
  }
  return {};
}

function applyJsonLd(result: VehicleUrlExtraction, objects: Record<string, unknown>[]) {
  for (const object of objects) {
    const type = object["@type"];
    const typeText = Array.isArray(type) ? type.join(" ") : String(type ?? "");
    if (!/(car|vehicle|product|offer)/i.test(typeText)) continue;

    const brand = getNestedString(object.brand, ["name"]) ?? firstString(object, ["brand", "manufacturer"]);
    setField(result, "make", brand, "json-ld", "high");
    setField(result, "model", firstString(object, ["model", "vehicleModel", "name"]), "json-ld", "medium");
    setField(
      result,
      "year",
      firstString(object, ["vehicleModelDate", "modelDate", "productionDate", "dateVehicleFirstRegistered"]),
      "json-ld",
      "medium",
    );
    setField(result, "fuel", firstString(object, ["fuelType", "fuel"]), "json-ld", "medium");

    const mileage =
      getNestedString(object.mileageFromOdometer, ["value"]) ??
      getNestedString(object.vehicleMileage, ["value"]) ??
      firstString(object, ["mileageFromOdometer", "mileage"]);
    setField(result, "mileage_km", mileage, "json-ld", "medium");

    const offer = Array.isArray(object.offers) ? object.offers[0] : object.offers;
    const price = getNestedString(offer, ["price"]) ?? firstString(object, ["price"]);
    setField(result, "price_eur", price, "json-ld", "medium");

    const country =
      getNestedString(object.address, ["addressCountry"]) ??
      getNestedString(offer, ["seller", "address", "addressCountry"]);
    setField(result, "country", country?.toUpperCase(), "json-ld", "medium");

    setField(result, "image_url", getImageFromJsonLd(object.image), "json-ld", "medium");
  }
}

function applyTextHeuristics(result: VehicleUrlExtraction, url: URL, html: string) {
  const title = getTitle(html);
  const description = getMetaContent(html, "description") ?? getMetaContent(html, "og:description");
  const imageUrl = getMetaContent(html, "og:image") ?? getMetaContent(html, "twitter:image");
  const text = normalizeSpace([title, description, stripTags(html).slice(0, 120_000)].filter(Boolean).join(" "));
  const makeModel = inferMakeModel([title, description].filter(Boolean).join(" ") || text);

  setField(result, "make", makeModel.make, "meta", "medium");
  setField(result, "model", makeModel.model, "meta", "low");
  setField(result, "year", extractYear(text), "text", "medium");
  setField(result, "mileage_km", extractMileage(text), "text", "medium");
  setField(result, "price_eur", extractPrice(text), "text", "medium");
  setField(result, "fuel", extractFuel(text), "text", "medium");
  setField(result, "country", inferCountry(url, text), "url", "medium");
  setField(result, "image_url", imageUrl, "meta", "medium");

  if (title && !result.fields.notes) {
    setField(result, "notes", `Titre annonce: ${normalizeSpace(title).slice(0, 220)}`, "meta", "low");
  }
}

function normalizeFields(result: VehicleUrlExtraction) {
  const year = result.fields.year ? extractYear(result.fields.year) : null;
  if (year) result.fields.year = year;
  else delete result.fields.year;

  const mileage = result.fields.mileage_km ? parseNumber(result.fields.mileage_km) : null;
  if (mileage != null && mileage >= 0 && mileage <= MAX_MILEAGE_KM) {
    result.fields.mileage_km = String(Math.round(mileage));
  } else {
    delete result.fields.mileage_km;
  }

  const price = result.fields.price_eur ? parseNumber(result.fields.price_eur) : null;
  if (price != null && price > 0 && price <= MAX_PRICE_EUR) {
    result.fields.price_eur = String(Math.round(price));
  } else {
    delete result.fields.price_eur;
  }

  if (result.fields.fuel) {
    const normalizedFuel = extractFuel(result.fields.fuel) ?? result.fields.fuel.toLowerCase();
    result.fields.fuel = normalizedFuel;
  }
  if (result.fields.country) result.fields.country = result.fields.country.toUpperCase().slice(0, 2);
}

export function isAllowedAutomobileUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return DOMAIN_RULES.some((rule) => rule.pattern.test(host));
  } catch {
    return false;
  }
}

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_HTML_BYTES) {
      throw new Error("Page trop volumineuse pour l'extraction");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

export async function extractVehicleFromUrl(rawUrl: string): Promise<VehicleUrlExtraction> {
  const url = new URL(rawUrl.trim());
  const result: VehicleUrlExtraction = {
    fields: { source_url: url.toString() },
    extractedFields: { source_url: { source: "url", confidence: "high" } },
    warnings: [],
  };

  if (!isAllowedAutomobileUrl(url.toString())) {
    result.warnings.push("Domaine non supporté pour l'extraction automatique.");
    return result;
  }

  let html = "";
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!response.ok) {
      result.warnings.push(`Extraction impossible: la source a répondu HTTP ${response.status}.`);
      return result;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      result.warnings.push("La source ne renvoie pas une page HTML exploitable.");
      return result;
    }
    html = await readLimitedText(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "erreur inconnue";
    result.warnings.push(`Extraction impossible (${message}). Le formulaire reste éditable manuellement.`);
    return result;
  }

  applyJsonLd(result, parseJsonLd(html));
  applyTextHeuristics(result, url, html);
  normalizeFields(result);

  const extractedCount = Object.keys(result.fields).filter((key) => key !== "source_url").length;
  if (extractedCount === 0) {
    result.warnings.push("Aucun champ véhicule fiable n'a pu être extrait. Vérifie l'URL puis complète manuellement.");
  } else if (extractedCount < 5) {
    result.warnings.push("Extraction partielle: vérifie les champs manquants avant de lancer l'analyse.");
  }

  return result;
}
