/**
 * Helpers partagés des routes /api/hf/* — auth owner + mapping d'erreurs HF.
 *
 * Toutes les routes HF sont owner-scopées (requireOwnerId → 401 sinon) :
 * pas d'appel anonyme à l'Inference API (coût + abus). Les erreurs HfError
 * sont mappées en codes HTTP propres, sans fuite de secret.
 */

import { NextResponse } from "next/server";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { HfError, isHfConfigured } from "@/lib/hf/client";

/** Garde owner + clé HF configurée. Retourne null si OK, sinon une réponse d'erreur. */
export async function guardHf(): Promise<NextResponse | null> {
  if (!isHfConfigured()) {
    return NextResponse.json(
      { error: "Hugging Face non configuré (HUGGINGFACE_API_KEY manquante)" },
      { status: 503 },
    );
  }
  try {
    await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Auth error" }, { status: 401 });
  }
  return null;
}

/** Mappe une erreur (HfError ou autre) en réponse HTTP sûre. */
export function hfErrorResponse(err: unknown): NextResponse {
  if (err instanceof HfError) {
    // 503 cold start / 429 rate limit -> 503 retriable côté client ; sinon 502.
    const status = err.status === 429 ? 429 : err.retriable ? 503 : 502;
    return NextResponse.json(
      { error: "Hugging Face inference error", model: err.model, status: err.status },
      { status },
    );
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Parse le JSON body, retourne [data, null] ou [null, errorResponse]. */
export async function parseJson<T = unknown>(req: Request): Promise<[T | null, NextResponse | null]> {
  try {
    return [(await req.json()) as T, null];
  } catch {
    return [null, NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })];
  }
}
