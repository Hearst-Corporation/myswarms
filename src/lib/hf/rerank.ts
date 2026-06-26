/**
 * HF capability — reranking (cross-encoder).
 *
 * Modèle par défaut : BAAI/bge-reranker-v2-m3. Étape 2 du RAG hybride :
 * top-N candidats (vecteurs) -> re-scoring requête×document -> top-K réels
 * avant injection dans le contexte Kimi. Réduit bruit/hallucinations.
 *
 * L'endpoint sentence-similarity HF prend {source_sentence, sentences[]} et
 * renvoie un score par phrase.
 */

import "server-only";
import { hfCall } from "./client";
import { HF_MODELS } from "./models";
import { isTeiConfigured, teiRerank } from "./tei";

export interface RerankResult {
  index: number;
  score: number;
  document: string;
}

/**
 * Re-classe `documents` par pertinence vis-à-vis de `query`.
 * Retourne la liste triée décroissante (score le plus pertinent en tête),
 * optionnellement tronquée à topK.
 *
 * Voie nominale : TEI self-host GPU1 (bge-reranker-v2-m3) si configuré.
 * Fallback : Inference API HF (sentence-similarity) — best-effort.
 */
export async function rerank(
  query: string,
  documents: string[],
  opts?: { model?: string; topK?: number; signal?: AbortSignal; preferHfApi?: boolean },
): Promise<RerankResult[]> {
  if (documents.length === 0) return [];

  let ranked: RerankResult[];

  if (isTeiConfigured() && !opts?.preferHfApi) {
    const scored = await teiRerank(query, documents);
    ranked = scored
      .map((s) => ({ index: s.index, score: s.score, document: documents[s.index] }))
      .sort((a, b) => b.score - a.score);
  } else {
    const model = opts?.model ?? HF_MODELS.reranker;
    const scores = await hfCall<number[]>(model, {
      inputs: { source_sentence: query, sentences: documents },
      signal: opts?.signal,
    });
    if (!Array.isArray(scores) || scores.length !== documents.length) {
      throw new Error("HF rerank: réponse de scores inattendue");
    }
    ranked = documents
      .map((document, index) => ({ index, score: scores[index], document }))
      .sort((a, b) => b.score - a.score);
  }

  return typeof opts?.topK === "number" ? ranked.slice(0, opts.topK) : ranked;
}
