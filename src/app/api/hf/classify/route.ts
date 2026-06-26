import { NextResponse } from "next/server";
import { z } from "zod";
import { zeroShotClassify } from "@/lib/hf/classify";
import { guardHf, hfErrorResponse, parseJson } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Schema = z.object({
  text: z.string().min(1).max(8192),
  labels: z.array(z.string().min(1).max(120)).min(2).max(20),
  multiLabel: z.boolean().optional(),
  model: z.string().optional(),
});

/** POST /api/hf/classify — zero-shot classification (routing/guardrails). Owner-scopé. */
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
    const result = await zeroShotClassify(parsed.data.text, parsed.data.labels, {
      multiLabel: parsed.data.multiLabel,
      model: parsed.data.model,
    });
    return NextResponse.json(result);
  } catch (e) {
    return hfErrorResponse(e);
  }
}
