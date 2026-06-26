import { NextResponse } from "next/server";
import { z } from "zod";
import { rerank } from "@/lib/hf/rerank";
import { guardHf, hfErrorResponse, parseJson } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Schema = z.object({
  query: z.string().min(1).max(4096),
  documents: z.array(z.string().min(1).max(8192)).min(1).max(100),
  topK: z.number().int().positive().max(100).optional(),
  model: z.string().optional(),
});

/** POST /api/hf/rerank — reranking cross-encoder (RAG étape 2). Owner-scopé. */
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
    const results = await rerank(parsed.data.query, parsed.data.documents, {
      model: parsed.data.model,
      topK: parsed.data.topK,
    });
    return NextResponse.json({ results });
  } catch (e) {
    return hfErrorResponse(e);
  }
}
