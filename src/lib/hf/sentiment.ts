/**
 * HF capability — sentiment finance / crypto (Hedge).
 *
 * Modèles : ElKulako/cryptobert (social crypto), ProsusAI/finbert (news macro),
 * cardiffnlp twitter-roberta (social généraliste). Produit un signal de
 * sentiment par actif/source pour le Risk/Signal Engine Hedge.
 *
 * RÈGLE Hedge : ce signal est une FEATURE D'AIDE — jamais un déclencheur
 * d'ordre. Le no-trade-by-default + kill switches restent maîtres.
 * À tracer dans Langfuse (model, label, score) côté appelant.
 */

import "server-only";
import { hfCall } from "./client";
import { HF_MODELS } from "./models";

export type SentimentLabel = "positive" | "negative" | "neutral";

export interface SentimentResult {
  label: SentimentLabel;
  score: number;
  /** Scores bruts par classe (softmax) pour ensembling. */
  raw: Array<{ label: string; score: number }>;
  model: string;
}

export type SentimentSource = "crypto" | "finance" | "social";

function modelFor(source: SentimentSource): string {
  switch (source) {
    case "finance":
      return HF_MODELS.sentimentFinance;
    case "social":
      return HF_MODELS.sentimentSocial;
    default:
      return HF_MODELS.sentimentCrypto;
  }
}

/** Normalise les labels hétérogènes des modèles vers positive/negative/neutral. */
function normalizeLabel(label: string): SentimentLabel {
  const l = label.toLowerCase();
  if (["positive", "bullish", "label_2", "pos"].includes(l)) return "positive";
  if (["negative", "bearish", "label_0", "neg"].includes(l)) return "negative";
  return "neutral";
}

/**
 * Analyse le sentiment d'un texte selon la source.
 * crypto -> CryptoBERT, finance -> FinBERT, social -> twitter-roberta.
 */
export async function analyzeSentiment(
  text: string,
  opts?: { source?: SentimentSource; model?: string; signal?: AbortSignal },
): Promise<SentimentResult> {
  const source = opts?.source ?? "crypto";
  const model = opts?.model ?? modelFor(source);

  // text-classification renvoie [[{label,score}, …]] (top_k) ou [{…}].
  const raw = await hfCall<Array<Array<{ label: string; score: number }>> | Array<{ label: string; score: number }>>(
    model,
    { inputs: text, parameters: { top_k: null }, signal: opts?.signal },
  );

  const flat: Array<{ label: string; score: number }> = Array.isArray(raw)
    ? Array.isArray((raw as unknown[])[0])
      ? (raw as Array<Array<{ label: string; score: number }>>)[0]
      : (raw as Array<{ label: string; score: number }>)
    : [];

  if (flat.length === 0) {
    return { label: "neutral", score: 0, raw: [], model };
  }

  const top = [...flat].sort((a, b) => b.score - a.score)[0];
  return {
    label: normalizeLabel(top.label),
    score: top.score,
    raw: flat,
    model,
  };
}

/**
 * Ensembling par source : combine FinBERT (news) + CryptoBERT (social) en un
 * score directionnel pondéré [-1, +1]. Pondération par défaut : news 0.5,
 * social 0.5. À utiliser comme feature, jamais comme ordre.
 */
export async function ensembleSentiment(
  inputs: { news?: string; social?: string },
  opts?: { weights?: { news: number; social: number }; signal?: AbortSignal },
): Promise<{ directional: number; parts: SentimentResult[] }> {
  const weights = opts?.weights ?? { news: 0.5, social: 0.5 };
  const parts: SentimentResult[] = [];

  const directionalOf = (r: SentimentResult): number =>
    r.label === "positive" ? r.score : r.label === "negative" ? -r.score : 0;

  let acc = 0;
  let wsum = 0;
  if (inputs.news?.trim()) {
    const r = await analyzeSentiment(inputs.news, { source: "finance", signal: opts?.signal });
    parts.push(r);
    acc += directionalOf(r) * weights.news;
    wsum += weights.news;
  }
  if (inputs.social?.trim()) {
    const r = await analyzeSentiment(inputs.social, { source: "crypto", signal: opts?.signal });
    parts.push(r);
    acc += directionalOf(r) * weights.social;
    wsum += weights.social;
  }

  return { directional: wsum > 0 ? acc / wsum : 0, parts };
}
