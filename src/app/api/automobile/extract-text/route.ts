import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";
import { checkRateLimitDistributed } from "@/lib/utils/rate-limit";
import { extractVehicleFromText } from "@/lib/automobile/textExtractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const RL_MAX = Number(process.env.EXTRACT_TEXT_RATELIMIT_MAX ?? "20");
const RL_WINDOW_S = Number(process.env.EXTRACT_TEXT_RATELIMIT_WINDOW_S ?? "60");

const BodySchema = z.object({
  text: z.string().trim().min(10, "Texte trop court").max(20000, "Texte trop long"),
});

/**
 * POST /api/automobile/extract-text — extrait les champs véhicule d'une annonce
 * en texte libre (NER camembert + règles). Owner-scopé. Fail-safe : si HF/NER
 * indisponible, renvoie l'extraction par règles (nerDegraded=true).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const sizeError = checkBodySize(req);
  if (sizeError) return sizeError;

  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  const rl = await checkRateLimitDistributed(`extract-text:${ownerId}`, {
    max: RL_MAX,
    windowSeconds: RL_WINDOW_S,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes — réessaie dans un instant." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation échouée", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await extractVehicleFromText(parsed.data.text);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction échouée";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
