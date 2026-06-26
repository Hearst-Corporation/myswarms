import { NextResponse } from "next/server";
import { z } from "zod";
import { embedTexts } from "@/lib/hf/embeddings";
import { guardHf, hfErrorResponse, parseJson } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Schema = z.object({
  texts: z.array(z.string().min(1).max(8192)).min(1).max(64),
  model: z.string().optional(),
});

/** POST /api/hf/embed — embeddings batch (RAG). Owner-scopé. */
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
    const vectors = await embedTexts(parsed.data.texts, { model: parsed.data.model });
    return NextResponse.json({ vectors, dims: vectors[0]?.length ?? 0, count: vectors.length });
  } catch (e) {
    return hfErrorResponse(e);
  }
}
