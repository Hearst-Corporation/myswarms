import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";
import { checkRateLimitDistributed } from "@/lib/utils/rate-limit";
import { extractVehicleFromImage, detectModelMismatch } from "@/lib/automobile/imageExtractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RL_MAX = Number(process.env.EXTRACT_IMAGE_RATELIMIT_MAX ?? "15");
const RL_WINDOW_S = Number(process.env.EXTRACT_IMAGE_RATELIMIT_WINDOW_S ?? "60");

const BodySchema = z.object({
  // image en base64 / dataURL (max ~11 Mo de base64).
  image: z.string().min(16).max(15_000_000),
  // contexte déclaré optionnel (pour l'anti-fraude).
  declared: z
    .object({
      make: z.string().max(60).optional(),
      model: z.string().max(60).optional(),
    })
    .optional(),
  tasks: z
    .object({
      damage: z.boolean().optional(),
      model: z.boolean().optional(),
      ocr: z.boolean().optional(),
    })
    .optional(),
});

/**
 * POST /api/automobile/extract-image — analyse une photo de véhicule :
 * état carrosserie + reco modèle + OCR (plaque masquée RGPD), + flag anti-fraude
 * si `declared` est fourni. Owner-scopé. Fail-safe par capacité.
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

  const rl = await checkRateLimitDistributed(`extract-image:${ownerId}`, {
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
    const result = await extractVehicleFromImage(parsed.data.image, { tasks: parsed.data.tasks });
    const fraud = parsed.data.declared
      ? detectModelMismatch(parsed.data.declared, result.recognizedModel)
      : { mismatch: false };
    return NextResponse.json({ ...result, fraud });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction échouée";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
