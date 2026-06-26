/**
 * Hugging Face capabilities — point d'entrée unique (server-only).
 *
 * Toutes les capacités HF câblées via l'Inference API. Le chat/LLM principal
 * reste Hypercli/Kimi (CLAUDE.md) ; HF couvre la périphérie : embeddings,
 * rerank, NER, sentiment, vision, OCR, zero-shot.
 *
 * Voir docs/huggingface-opportunities.md pour le catalogue complet et
 * docs/HF_CAPABILITIES.md pour l'usage.
 */

export { hfCall, HfError, isHfConfigured } from "./client";
export { HF_MODELS, HF_TASKS, type HfModelKey } from "./models";

export { embedText, embedTexts, cosineSimilarity, normalizeEmbeddings } from "./embeddings";
export { rerank, type RerankResult } from "./rerank";
export { extractEntities, groupEntities, type NerEntity, type NerVariant } from "./ner";
export {
  analyzeSentiment,
  ensembleSentiment,
  type SentimentResult,
  type SentimentSource,
  type SentimentLabel,
} from "./sentiment";
export {
  ocrImage,
  classifyImage,
  detectCarDamage,
  recognizeCarModel,
  toBytes,
  type ImageClassification,
} from "./vision";
export { zeroShotClassify, type ZeroShotResult } from "./classify";
