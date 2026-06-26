/**
 * HF capability — vision & OCR (Automobile APM).
 *
 * - OCR (trocr) : crops VIN / odomètre / plaque -> texte.
 * - Classif image : état carrosserie (car_damage_detection) + reco modèle
 *   (stanford_cars ConvNeXt) -> scoring/flagging APM.
 *
 * Les endpoints image-* HF prennent un body binaire. On accepte un Buffer/
 * Uint8Array ou une dataURL/base64.
 */

import "server-only";
import { hfCall } from "./client";
import { HF_MODELS } from "./models";

export interface ImageClassification {
  label: string;
  score: number;
}

/** Convertit une entrée image hétérogène en octets bruts. */
export function toBytes(image: Uint8Array | ArrayBuffer | string): Uint8Array {
  if (image instanceof Uint8Array) return image;
  if (image instanceof ArrayBuffer) return new Uint8Array(image);
  // string : dataURL (data:...;base64,XXX) ou base64 brut.
  const b64 = image.startsWith("data:") ? image.slice(image.indexOf(",") + 1) : image;
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** OCR d'un crop image (texte imprimé : VIN, kilométrage, plaque). */
export async function ocrImage(
  image: Uint8Array | ArrayBuffer | string,
  opts?: { model?: string; signal?: AbortSignal },
): Promise<string> {
  const model = opts?.model ?? HF_MODELS.ocrPrinted;
  const raw = await hfCall<Array<{ generated_text: string }> | { generated_text: string }>(model, {
    inputs: null,
    binary: toBytes(image),
    signal: opts?.signal,
  });
  if (Array.isArray(raw)) return raw[0]?.generated_text ?? "";
  return raw?.generated_text ?? "";
}

/** Classification image générique (renvoie labels triés par score). */
export async function classifyImage(
  image: Uint8Array | ArrayBuffer | string,
  opts: { model: string; topK?: number; signal?: AbortSignal },
): Promise<ImageClassification[]> {
  const raw = await hfCall<ImageClassification[]>(opts.model, {
    inputs: null,
    binary: toBytes(image),
    signal: opts.signal,
  });
  const list = Array.isArray(raw) ? raw : [];
  const sorted = [...list].sort((a, b) => b.score - a.score);
  return typeof opts.topK === "number" ? sorted.slice(0, opts.topK) : sorted;
}

/** Scoring état carrosserie (intact / rayé / bosselé …) pour pricing/flag APM. */
export async function detectCarDamage(
  image: Uint8Array | ArrayBuffer | string,
  opts?: { signal?: AbortSignal },
): Promise<ImageClassification[]> {
  return classifyImage(image, { model: HF_MODELS.carDamage, signal: opts?.signal });
}

/** Reconnaissance marque/modèle depuis une photo (pré-remplissage + anti-fraude). */
export async function recognizeCarModel(
  image: Uint8Array | ArrayBuffer | string,
  opts?: { topK?: number; signal?: AbortSignal },
): Promise<ImageClassification[]> {
  return classifyImage(image, { model: HF_MODELS.carModel, topK: opts?.topK ?? 5, signal: opts?.signal });
}
