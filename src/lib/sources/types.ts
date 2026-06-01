import { z } from "zod";

export type RawListing = {
  source_url: string;
  source_native_id?: string;
  vin?: string;
  make?: string;
  model?: string;
  variant?: string;
  title?: string;
  year?: number;
  km?: number;
  price_eur?: number;
  fuel?: string;
  gearbox?: string;
  body?: string;
  country?: string;
  city?: string;
  photos?: string[];
  raw: Record<string, unknown>;
};

export type FetchParams = {
  make?: string;
  maxPrice?: number;
  country?: string;
  limit?: number;
  maxPages?: number;
};

/**
 * Résultat d'une ré-observation ciblée d'une annonce connue (T2 re-scan).
 *   - alive   : annonce toujours en ligne ; `price` = prix courant observé (ou null si illisible).
 *   - gone    : annonce retirée (404/410 ou redirect vers la recherche). NE conclut JAMAIS "vendu" seul.
 *   - unknown : 403/429/5xx/timeout/parse échoué → on ne touche à RIEN (échec scraper ≠ vente).
 */
export type ProbeResult =
  | { state: "alive"; price: number | null }
  | { state: "gone" }
  | { state: "unknown"; reason: string };

export interface VehicleSource {
  id: string;
  name: string;
  fetch(params: FetchParams): AsyncIterable<RawListing>;
  /**
   * Optionnel. Présence ⇒ source éligible au re-scan ciblé par URL (Mode A).
   * Re-fetch une annonce connue et indique si elle vit, a disparu, ou est indéterminée.
   */
  probe?(sourceUrl: string): Promise<ProbeResult>;
}

// Zod schema d'une insertion DB normalisée (aligné sur supabase types vehicles.Insert)
export const VehicleInsertSchema = z.object({
  source_id: z.string().min(1),
  source_url: z.string().url(),
  source_native_id: z.string().optional(),
  vin: z
    .string()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/i)
    .optional(),
  make: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase())
    .optional(),
  model: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase())
    .optional(),
  variant: z.string().optional(),
  title: z.string().max(500).optional(),
  year: z.number().int().min(1990).max(2030).optional(),
  km: z.number().int().min(0).max(2_000_000).optional(),
  price_eur: z.number().min(0).max(10_000_000).optional(),
  fuel: z.string().optional(),
  gearbox: z.string().optional(),
  body: z.string().optional(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  city: z.string().optional(),
  photos: z.array(z.string().url()).default([]),
  raw: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(["available", "sold", "removed"]).default("available"),
});

export type VehicleInsert = z.infer<typeof VehicleInsertSchema>;

export type IngestResult = {
  run_id: string;
  status: "ok" | "fail";
  count_new: number;
  count_updated: number;
  count_skipped: number;
  error?: string;
};
