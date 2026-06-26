import { NextResponse } from "next/server";
import { isHfConfigured } from "@/lib/hf/client";
import { HF_MODELS } from "@/lib/hf/models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/hf/health — état de la configuration HF (sans secret).
 * Indique si la clé est présente et quels modèles sont câblés.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    configured: isHfConfigured(),
    baseUrl: (process.env.HF_INFERENCE_BASE_URL ?? "").trim() || "https://router.huggingface.co/hf-inference/models",
    models: HF_MODELS,
  });
}
