/**
 * HF capability — embeddings de texte (RAG / mémoire agents).
 *
 * Modèle par défaut : BAAI/bge-m3 (multilingue FR, dense 1024d). Sert
 * d'alternative/complément self-hostable à qwen3-embedding (Hypercli).
 * Inference API HF via le client central.
 */

import "server-only";
import { hfCall } from "./client";
import { HF_MODELS } from "./models";
import { isTeiConfigured, teiEmbed } from "./tei";

/** Embedding d'un seul texte -> vecteur dense. */
export async function embedText(
  text: string,
  opts?: { model?: string; signal?: AbortSignal },
): Promise<number[]> {
  const [vec] = await embedTexts([text], opts);
  return vec;
}

/**
 * Embeddings batch.
 *
 * Voie nominale : TEI self-host GPU1 (bge-m3, fiable, ~40ms) si configuré.
 * Fallback : Inference API HF (feature-extraction) — best-effort, le serverless
 * HF étant intermittent. L'endpoint HF renvoie soit un vecteur par input, soit
 * une matrice token×dim qu'on moyenne (mean pool) — normalizeEmbeddings gère.
 */
export async function embedTexts(
  texts: string[],
  opts?: { model?: string; signal?: AbortSignal; preferHfApi?: boolean },
): Promise<number[][]> {
  if (texts.length === 0) return [];

  // TEI prioritaire (sauf override explicite vers l'API HF).
  if (isTeiConfigured() && !opts?.preferHfApi) {
    return teiEmbed(texts);
  }

  const model = opts?.model ?? HF_MODELS.embedding;
  const raw = await hfCall<number[] | number[][] | number[][][]>(model, {
    inputs: texts,
    // Le router HF exige le pipeline explicite pour la feature-extraction.
    pipeline: "feature-extraction",
    signal: opts?.signal,
  });
  return normalizeEmbeddings(raw, texts.length);
}

/** Normalise les formats possibles de feature-extraction en number[][]. */
export function normalizeEmbeddings(
  raw: number[] | number[][] | number[][][],
  expected: number,
): number[][] {
  if (!Array.isArray(raw)) throw new Error("HF embeddings: réponse inattendue");

  // Cas 1 : déjà number[][] (un vecteur par input).
  if (Array.isArray(raw[0]) && typeof (raw[0] as number[])[0] === "number") {
    return raw as number[][];
  }

  // Cas 2 : un seul input -> number[] -> on enveloppe.
  if (typeof raw[0] === "number") {
    return [raw as number[]];
  }

  // Cas 3 : number[][][] (token×dim par input) -> mean pooling.
  if (Array.isArray(raw[0]) && Array.isArray((raw[0] as number[][])[0])) {
    return (raw as number[][][]).map(meanPool);
  }

  if (expected === 1) return [raw as unknown as number[]];
  throw new Error("HF embeddings: format non reconnu");
}

function meanPool(tokens: number[][]): number[] {
  if (tokens.length === 0) return [];
  const dim = tokens[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const t of tokens) for (let i = 0; i < dim; i++) out[i] += t[i];
  for (let i = 0; i < dim; i++) out[i] /= tokens.length;
  return out;
}

/** Similarité cosinus entre deux vecteurs (utilitaire RAG). */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
