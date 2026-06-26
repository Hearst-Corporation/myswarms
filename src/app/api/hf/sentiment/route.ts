import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeSentiment, ensembleSentiment } from "@/lib/hf/sentiment";
import { guardHf, hfErrorResponse, parseJson } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Soit un texte simple + source, soit un ensembling news/social.
const Schema = z.union([
  z.object({
    text: z.string().min(1).max(8192),
    source: z.enum(["crypto", "finance", "social"]).optional(),
    model: z.string().optional(),
  }),
  z.object({
    news: z.string().max(8192).optional(),
    social: z.string().max(8192).optional(),
    ensemble: z.literal(true),
  }),
]);

/**
 * POST /api/hf/sentiment — sentiment finance/crypto (Hedge feature).
 * Owner-scopé. NB : signal d'aide, jamais déclencheur d'ordre.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const guard = await guardHf();
  if (guard) return guard;

  const [body, err] = await parseJson(req);
  if (err) return err;
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if ("ensemble" in parsed.data) {
      const result = await ensembleSentiment({ news: parsed.data.news, social: parsed.data.social });
      return NextResponse.json(result);
    }
    const result = await analyzeSentiment(parsed.data.text, {
      source: parsed.data.source,
      model: parsed.data.model,
    });
    return NextResponse.json(result);
  } catch (e) {
    return hfErrorResponse(e);
  }
}
