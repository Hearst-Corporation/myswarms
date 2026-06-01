import carList from "./data/car-list.json";

/**
 * Base marques → modèles embarquée (dataset open `matthlavacka/car-list`,
 * 39 marques / 892 modèles, EU-centric). Logos servis depuis le CDN jsDelivr
 * du dataset `filippofilip95/car-logos-dataset` (slug = marque normalisée).
 */
export interface BrandEntry {
  brand: string;
  models: string[];
}

export const BRANDS: BrandEntry[] = (carList as BrandEntry[])
  .slice()
  .sort((a, b) => a.brand.localeCompare(b.brand, "fr"));

const LOGO_BASE =
  "https://cdn.jsdelivr.net/gh/filippofilip95/car-logos-dataset@master/logos/optimized";

const DIACRITICS = /[̀-ͯ]/g;

/** Slug logo d'une marque : minuscules, sans accents, espaces → tirets. */
function brandSlug(brand: string): string {
  return brand
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/\s+/g, "-");
}

/** URL du logo PNG optimisé d'une marque (CDN jsDelivr). */
export function brandLogoUrl(brand: string): string {
  return `${LOGO_BASE}/${brandSlug(brand)}.png`;
}

/** Modèles d'une marque (vide si marque inconnue → fallback saisie libre). */
export function getModelsForBrand(brand: string): string[] {
  return BRANDS.find((b) => b.brand === brand)?.models ?? [];
}
