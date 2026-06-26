import { NextResponse } from "next/server";
import { z } from "zod";
import { ocrImage, detectCarDamage, recognizeCarModel } from "@/lib/hf/vision";
import { guardHf, hfErrorResponse, parseJson } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// image = dataURL ou base64 brut. task = quoi faire.
const Schema = z.object({
  image: z.string().min(16).max(15_000_000), // ~11MB base64
  task: z.enum(["ocr", "car_damage", "car_model"]),
});

/**
 * POST /api/hf/vision — OCR / état carrosserie / reco modèle (Automobile APM).
 * Owner-scopé. image en base64/dataURL.
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
    const { image, task } = parsed.data;
    if (task === "ocr") {
      const text = await ocrImage(image);
      return NextResponse.json({ task, text });
    }
    if (task === "car_damage") {
      const labels = await detectCarDamage(image);
      return NextResponse.json({ task, labels });
    }
    const labels = await recognizeCarModel(image);
    return NextResponse.json({ task, labels });
  } catch (e) {
    return hfErrorResponse(e);
  }
}
