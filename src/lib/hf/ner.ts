/**
 * HF capability — NER / extraction d'entités.
 *
 * Modèle par défaut : Jean-Baptiste/camembert-ner (FR). Extraction LOC/ORG/PER
 * sur emails (Chief of Staff), annonces (Automobile/Real-estate). Variante
 * dates (camembert-ner-with-dates) et multilingue (wikineural) via le registre.
 *
 * L'endpoint token-classification HF renvoie une liste d'entités agrégées.
 */

import "server-only";
import { hfCall } from "./client";
import { HF_MODELS } from "./models";

export interface NerEntity {
  entityGroup: string;
  word: string;
  score: number;
  start?: number;
  end?: number;
}

interface RawNerEntity {
  entity_group?: string;
  entity?: string;
  word: string;
  score: number;
  start?: number;
  end?: number;
}

export type NerVariant = "fr" | "dates" | "multilingual";

function modelFor(variant: NerVariant): string {
  switch (variant) {
    case "dates":
      return HF_MODELS.nerDates;
    case "multilingual":
      return HF_MODELS.nerMultilingual;
    default:
      return HF_MODELS.nerFr;
  }
}

/** Extrait les entités nommées d'un texte. */
export async function extractEntities(
  text: string,
  opts?: { variant?: NerVariant; model?: string; minScore?: number; signal?: AbortSignal },
): Promise<NerEntity[]> {
  if (!text.trim()) return [];
  const model = opts?.model ?? modelFor(opts?.variant ?? "fr");
  const min = opts?.minScore ?? 0.5;

  const raw = await hfCall<RawNerEntity[]>(model, {
    inputs: text,
    parameters: { aggregation_strategy: "simple" },
    signal: opts?.signal,
  });

  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => ({
      entityGroup: e.entity_group ?? e.entity ?? "MISC",
      word: e.word,
      score: e.score,
      start: e.start,
      end: e.end,
    }))
    .filter((e) => e.score >= min);
}

/** Regroupe les entités par type (LOC/ORG/PER/…) pour usage structuré. */
export function groupEntities(entities: NerEntity[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const e of entities) {
    const key = e.entityGroup;
    (out[key] ??= []).push(e.word);
  }
  return out;
}
