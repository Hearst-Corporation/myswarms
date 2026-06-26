import { NextResponse } from "next/server";
import { z } from "zod";
import { extractEntities, groupEntities } from "@/lib/hf/ner";
import { guardHf, hfErrorResponse, parseJson } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Schema = z.object({
  text: z.string().min(1).max(16000),
  variant: z.enum(["fr", "dates", "multilingual"]).optional(),
  minScore: z.number().min(0).max(1).optional(),
  model: z.string().optional(),
});

/** POST /api/hf/ner — extraction d'entités (annonces, emails). Owner-scopé. */
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
    const entities = await extractEntities(parsed.data.text, {
      variant: parsed.data.variant,
      minScore: parsed.data.minScore,
      model: parsed.data.model,
    });
    return NextResponse.json({ entities, grouped: groupEntities(entities) });
  } catch (e) {
    return hfErrorResponse(e);
  }
}
