/**
 * Hugging Face — registre central des modèles câblés.
 *
 * Source de vérité TS (pas de magic strings dans les capabilities). Chaque
 * modèle est overridable par env (HF_MODEL_<KEY>) pour basculer vers une
 * variante self-hostée GPU2 sans toucher le code. Priorités issues de
 * docs/huggingface-opportunities.md.
 *
 * Tous ces modèles sont appelés via l'Inference API HF (cf. ./client) avec
 * HUGGINGFACE_API_KEY. Aucun secret ici.
 */

function envModel(key: string, fallback: string): string {
  return (process.env[`HF_MODEL_${key}`] ?? "").trim() || fallback;
}

export const HF_MODELS = {
  // ── Embeddings (RAG / mémoire agents) ────────────────────────────────────
  embedding: envModel("EMBEDDING", "BAAI/bge-m3"),
  embeddingFr: envModel("EMBEDDING_FR", "OrdalieTech/Solon-embeddings-large-0.1"),

  // ── Reranking (cross-encoder) ────────────────────────────────────────────
  reranker: envModel("RERANKER", "BAAI/bge-reranker-v2-m3"),

  // ── NER / extraction structurée ──────────────────────────────────────────
  nerFr: envModel("NER_FR", "Jean-Baptiste/camembert-ner"),
  nerDates: envModel("NER_DATES", "Jean-Baptiste/camembert-ner-with-dates"),
  nerMultilingual: envModel("NER_MULTI", "Babelscape/wikineural-multilingual-ner"),

  // ── Sentiment (Hedge) ────────────────────────────────────────────────────
  sentimentCrypto: envModel("SENTIMENT_CRYPTO", "ElKulako/cryptobert"),
  sentimentFinance: envModel("SENTIMENT_FINANCE", "ProsusAI/finbert"),
  sentimentSocial: envModel("SENTIMENT_SOCIAL", "cardiffnlp/twitter-roberta-base-sentiment-latest"),

  // ── Vision / OCR (Automobile APM) ────────────────────────────────────────
  ocrPrinted: envModel("OCR_PRINTED", "microsoft/trocr-base-printed"),
  carDamage: envModel("CAR_DAMAGE", "beingamit99/car_damage_detection"),
  carModel: envModel("CAR_MODEL", "anonauthors/stanford_cars-ConvNeXt-base"),

  // ── Zero-shot classification (routing / guardrails) ──────────────────────
  zeroShot: envModel("ZERO_SHOT", "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"),
} as const;

export type HfModelKey = keyof typeof HF_MODELS;

/** Tâche Inference API associée (pour documentation/diagnostic). */
export const HF_TASKS: Record<HfModelKey, string> = {
  embedding: "feature-extraction",
  embeddingFr: "feature-extraction",
  reranker: "sentence-similarity",
  nerFr: "token-classification",
  nerDates: "token-classification",
  nerMultilingual: "token-classification",
  sentimentCrypto: "text-classification",
  sentimentFinance: "text-classification",
  sentimentSocial: "text-classification",
  ocrPrinted: "image-to-text",
  carDamage: "image-classification",
  carModel: "image-classification",
  zeroShot: "zero-shot-classification",
};
