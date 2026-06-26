import { NextRequest, NextResponse } from "next/server";
import { listingsClient, ListingsQuerySchema } from "@/lib/crewai/listings";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/listings — proxy BFF vers l'engine `/v1/listings` (scrape immobilier).
 *
 * Owner-scopé : `requireOwnerId()` dérive l'owner de la session Supabase et le
 * propage à `listingsClient.search`, qui signe le JWT interne pour l'engine.
 * Pas de session → 401 (jamais de scrape anonyme).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sizeError = checkBodySize(req);
  if (sizeError) return sizeError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ListingsQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const ownerId = await requireOwnerId();
    const result = await listingsClient.search(parsed.data, ownerId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
