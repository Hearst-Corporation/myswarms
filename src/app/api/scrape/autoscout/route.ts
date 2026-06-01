import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchAutoScout, MAX_RESULTS_CAP, DEFAULT_MAX_RESULTS } from "@/lib/apify/autoscout";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RequestBodySchema = z
  .object({
    make: z.string().trim().min(1, "make est obligatoire"),
    model: z.string().optional(),
    market: z.string().optional(),
    priceMin: z.number().nonnegative().optional(),
    priceMax: z.number().nonnegative().optional(),
    maxResults: z.number().int().positive().max(MAX_RESULTS_CAP).optional().default(DEFAULT_MAX_RESULTS),
  })
  .refine(
    (data) =>
      data.priceMin == null || data.priceMax == null || data.priceMin <= data.priceMax,
    { message: "priceMin doit être inférieur ou égal à priceMax", path: ["priceMin"] },
  );

/**
 * POST /api/scrape/autoscout
 *
 * Body: { make, model?, market?, priceMin?, priceMax?, maxResults? }
 * Réponse: { listings: AutoScoutListing[]; count: number }
 * Erreurs: 400 (validation), 401 (non authentifié), 502 (Apify)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth
  try {
    await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  // Parse + validation Zod
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const parsed = RequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation échouée", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Appel AutoScout via Apify
  try {
    const listings = await searchAutoScout(parsed.data);
    return NextResponse.json({ listings, count: listings.length });
  } catch (err) {
    console.error("[scrape/autoscout]", err);
    return NextResponse.json(
      { error: "La recherche AutoScout24 a échoué. Réessayez." },
      { status: 502 },
    );
  }
}
