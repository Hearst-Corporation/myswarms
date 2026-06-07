import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { checkBodySize } from "@/lib/utils/body-limit";
import { extractVehicleFromUrl, isAllowedAutomobileUrl } from "@/lib/automobile/urlExtractor";
import { findRecentRunByUrl } from "@/lib/automobile/dedup";
import { checkRateLimitDistributed } from "@/lib/utils/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Rate-limit : fetch sortant + dédup fan-out N status engine. Env-driven.
const RL_MAX = Number(process.env.EXTRACT_URL_RATELIMIT_MAX ?? "30");
const RL_WINDOW_S = Number(process.env.EXTRACT_URL_RATELIMIT_WINDOW_S ?? "60");

const BodySchema = z.object({
  url: z.string().trim().url("URL invalide"),
});

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

  const rl = await checkRateLimitDistributed(`extract-url:${ownerId}`, {
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

  if (!isAllowedAutomobileUrl(parsed.data.url)) {
    return NextResponse.json(
      {
        error:
          "Domaine non supporté. Colle une URL AutoScout24, mobile.de, Leboncoin, La Centrale, Subito, Milanuncios ou coches.net.",
      },
      { status: 400 },
    );
  }

  try {
    const extraction = await extractVehicleFromUrl(parsed.data.url);
    // Dédup soft : signale un run récent sur la même annonce (best-effort).
    const duplicate = await findRecentRunByUrl(ownerId, parsed.data.url);
    return NextResponse.json({ ...extraction, duplicate });
  } catch (err) {
    console.error("[automobile/extract-url]", err);
    return NextResponse.json(
      { error: "Extraction impossible. Complète le formulaire manuellement." },
      { status: 502 },
    );
  }
}
