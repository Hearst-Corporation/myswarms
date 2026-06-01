/**
 * Scraper AutoScout24 — HTTP pur, sans dépendance externe.
 *
 * Stratégie : parse direct du HTML SSR d'AutoScout24 via les attributs data-*
 * portés par chaque <article data-testid="list-item">.
 * En cas de blocage Akamai (HTML vide / 403), la fonction fetch() retourne
 * un tableau vide — l'appelant peut afficher un message d'erreur approprié.
 *
 * Porté depuis Desktop/APM/lib/sources/autoscout24-scraper.ts
 */

import type { FetchParams, ProbeResult, RawListing, VehicleSource } from "./types";
import { normalizeListing } from "./utils";

const PROBE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Re-scan d'une annonce connue ──────────────────────────────────────────────

function parseAs24Detail(html: string): { price: number | null; unavailable: boolean } {
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  if (blocks) {
    for (const block of blocks) {
      const jsonText = block
        .replace(/^<script type="application\/ld\+json">/, "")
        .replace(/<\/script>$/, "");
      let parsed: unknown;
      try { parsed = JSON.parse(jsonText); } catch { continue; }
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of candidates) {
        if (node && typeof node === "object" && (node as { offers?: unknown }).offers) {
          const offers = (node as { offers: Record<string, unknown> }).offers;
          const priceRaw = offers.price;
          const price =
            typeof priceRaw === "number" ? priceRaw
            : typeof priceRaw === "string" && priceRaw.trim() !== "" ? Number(priceRaw)
            : null;
          const availability = typeof offers.availability === "string" ? offers.availability : "";
          const unavailable = availability !== "" && !/InStock/i.test(availability);
          return { price: price !== null && Number.isFinite(price) ? price : null, unavailable };
        }
      }
    }
  }
  return { price: null, unavailable: false };
}

async function probeAs24(sourceUrl: string): Promise<ProbeResult> {
  let res: Response;
  try {
    res = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": PROBE_UA,
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });
  } catch (e) {
    return { state: "unknown", reason: e instanceof Error ? e.message : "fetch error" };
  }

  const status = res.status;
  const finalUrl = res.url ?? sourceUrl;
  if (status === 404 || status === 410) return { state: "gone" };
  if (/\/lst|\/recherche|\/search/.test(finalUrl)) return { state: "gone" };
  if (status === 403 || status === 429) return { state: "unknown", reason: `blocked ${status}` };
  if (status >= 500) return { state: "unknown", reason: `server ${status}` };
  if (status !== 200) return { state: "unknown", reason: `http ${status}` };

  let html: string;
  try { html = await res.text(); } catch (e) {
    return { state: "unknown", reason: e instanceof Error ? e.message : "body read error" };
  }

  const { price, unavailable } = parseAs24Detail(html);
  if (unavailable) return { state: "gone" };
  if (price === null) return { state: "unknown", reason: "no price parsed (200)" };
  return { state: "alive", price };
}

// ── Parse HTML liste ──────────────────────────────────────────────────────────

const COUNTRY_FROM_TLD: Record<string, string> = {
  fr: "FR", de: "DE", it: "IT", es: "ES",
  nl: "NL", be: "BE", at: "AT", lu: "LU",
};

const COUNTRY_MAP: Record<string, string> = {
  f: "FR", d: "DE", b: "BE", l: "LU",
  n: "NL", i: "IT", e: "ES", a: "AT",
};

type Attrs = Record<string, string>;

function parseAttrs(tag: string): Attrs {
  const attrs: Attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) attrs[m[1]] = m[2];
  return attrs;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function extractPhotosFromBlock(block: string): string[] {
  const photos: string[] = [];
  const seen = new Set<string>();
  const re = /https:\/\/prod\.pictures\.autoscout24\.net\/listing-images\/[^"'\s]+\.(?:webp|jpg|jpeg|png)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const url = m[0].replace(/\/\d+x\d+\.(webp|jpg|jpeg|png)$/, "/480x360.jpg");
    if (!seen.has(url)) { seen.add(url); photos.push(url); }
    if (photos.length >= 3) break;
  }
  return photos;
}

function extractTitleFromBlock(block: string): string | undefined {
  const titleMatch = block.match(
    /<span class="ListItemTitle_title[^"]*">([^<]+)<\/span>(?:[^<]*<span class="ListItemTitle_subtitle[^"]*">\s*<!--[^>]*-->\s*([^<]*?)\s*<!--[^>]*-->\s*<\/span>)?/,
  );
  if (!titleMatch) return undefined;
  const title = decodeHtmlEntities(titleMatch[1].trim());
  const subtitle = titleMatch[2] ? decodeHtmlEntities(titleMatch[2].trim()) : "";
  return (subtitle ? `${title} ${subtitle}` : title).slice(0, 500);
}

function buildListingFromBlock(block: string, attrs: Attrs, domain: string): RawListing | null {
  const guid = attrs["data-guid"] || attrs["id"];
  const make = attrs["data-make"];
  const model = attrs["data-model"];
  const price = attrs["data-price"];
  if (!guid || !make || !model || !price) return null;

  const source_url = `https://${domain}/offres/${guid}`;
  const reg = attrs["data-first-registration"];
  const yearParsed = reg ? parseInt(reg.split("-")[1] ?? "", 10) : NaN;
  const kmParsed = attrs["data-mileage"] ? parseInt(attrs["data-mileage"], 10) : NaN;
  const priceParsed = parseFloat(price);
  const country = attrs["data-listing-country"]
    ? COUNTRY_MAP[attrs["data-listing-country"].toLowerCase()]
    : undefined;

  return normalizeListing({
    source_url,
    source_native_id: guid,
    title: extractTitleFromBlock(block),
    make,
    model,
    year: Number.isFinite(yearParsed) ? yearParsed : undefined,
    km: Number.isFinite(kmParsed) ? kmParsed : undefined,
    price_eur: Number.isFinite(priceParsed) ? priceParsed : undefined,
    fuel: attrs["data-fuel-type"],
    country,
    city: attrs["data-listing-zip-code"] ?? undefined,
    photos: extractPhotosFromBlock(block),
    raw: { source: "autoscout24", domain, from: "html" },
  });
}

function extractFromHtml(html: string, domain: string): RawListing[] {
  const out: RawListing[] = [];
  const re = /<article[^>]*data-testid=["'](?:list-item|ListItem)["'][^>]*>([\s\S]*?)<\/article>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const openTagEnd = m[0].indexOf(">");
    if (openTagEnd < 0) continue;
    const openTag = m[0].slice(0, openTagEnd + 1);
    const attrs = parseAttrs(openTag);
    const listing = buildListingFromBlock(m[0], attrs, domain);
    if (listing) out.push(listing);
  }
  return out;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function buildUrl(domain: string, page: number, params: FetchParams): string {
  const url = new URL(`https://${domain}/lst`);
  url.searchParams.set("atype", "C");
  url.searchParams.set("sort", "age");
  url.searchParams.set("desc", "1");
  url.searchParams.set("page", String(page));
  if (params.make) url.searchParams.set("mmvmk0", params.make);
  if (params.maxPrice) url.searchParams.set("priceto", String(params.maxPrice));
  return url.toString();
}

// ── Factory ───────────────────────────────────────────────────────────────────

function makeAutoscoutSource(domain: string, label: string): VehicleSource {
  const tld = domain.split(".").pop() ?? "fr";
  const defaultCountry = COUNTRY_FROM_TLD[tld];

  return {
    id: `autoscout24-${tld}`,
    name: label,

    async *fetch(params: FetchParams): AsyncIterable<RawListing> {
      const maxPages = params.maxPages ?? 3;
      const limit = params.limit ?? Infinity;
      const results: RawListing[] = [];

      for (let p = 1; p <= maxPages && results.length < limit; p++) {
        const html = await fetchHtml(buildUrl(domain, p, params));
        if (!html) break;
        const pageListings = extractFromHtml(html, domain);
        if (pageListings.length === 0) break;
        for (const l of pageListings) {
          if (!l.country && defaultCountry) l.country = defaultCountry;
          results.push(l);
          if (results.length >= limit) break;
        }
      }

      let yielded = 0;
      for (const item of results) {
        if (yielded >= limit) return;
        yield item;
        yielded++;
      }
    },

    async probe(sourceUrl: string): Promise<ProbeResult> {
      return probeAs24(sourceUrl);
    },
  };
}

// ── Exports par marché ────────────────────────────────────────────────────────

export const autoscout24FR = makeAutoscoutSource("www.autoscout24.fr", "AutoScout24 France");
export const autoscout24DE = makeAutoscoutSource("www.autoscout24.de", "AutoScout24 Allemagne");
export const autoscout24IT = makeAutoscoutSource("www.autoscout24.it", "AutoScout24 Italie");
export const autoscout24ES = makeAutoscoutSource("www.autoscout24.es", "AutoScout24 Espagne");
export const autoscout24AT = makeAutoscoutSource("www.autoscout24.at", "AutoScout24 Autriche");
export const autoscout24NL = makeAutoscoutSource("www.autoscout24.nl", "AutoScout24 Pays-Bas");
export const autoscout24LU = makeAutoscoutSource("www.autoscout24.lu", "AutoScout24 Luxembourg");

/** Index de tous les marchés disponibles */
export const AUTOSCOUT24_SOURCES: VehicleSource[] = [
  autoscout24FR,
  autoscout24DE,
  autoscout24IT,
  autoscout24ES,
  autoscout24AT,
  autoscout24NL,
  autoscout24LU,
];
