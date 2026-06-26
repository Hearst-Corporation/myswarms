/**
 * HF capability — zero-shot classification (routing / guardrails).
 *
 * Modèle par défaut : mDeBERTa-v3 MNLI/XNLI (multilingue). Sert à router un
 * run d'agent vers une verticale (automobile/immo/finance/general) ou à
 * détecter une intention sans réentraîner — utile au control-plane MySwarms.
 */

import "server-only";
import { hfCall } from "./client";
import { HF_MODELS } from "./models";

export interface ZeroShotResult {
  labels: string[];
  scores: number[];
  top: { label: string; score: number };
}

interface RawZeroShot {
  sequence: string;
  labels: string[];
  scores: number[];
}

/** Classe `text` parmi `candidateLabels` (zero-shot). */
export async function zeroShotClassify(
  text: string,
  candidateLabels: string[],
  opts?: { model?: string; multiLabel?: boolean; signal?: AbortSignal },
): Promise<ZeroShotResult> {
  const model = opts?.model ?? HF_MODELS.zeroShot;
  const raw = await hfCall<RawZeroShot>(model, {
    inputs: text,
    parameters: { candidate_labels: candidateLabels, multi_label: opts?.multiLabel ?? false },
    signal: opts?.signal,
  });

  const labels = raw?.labels ?? [];
  const scores = raw?.scores ?? [];
  return {
    labels,
    scores,
    top: { label: labels[0] ?? "", score: scores[0] ?? 0 },
  };
}
