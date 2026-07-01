import OpenAI from "openai";

const BUILD_TIME = process.env.NEXT_PHASE === "phase-production-build";

const apiKey =
  process.env.HYPERCLI_API_KEY ?? (BUILD_TIME ? "build-placeholder" : undefined);
const baseURL = process.env.HYPERCLI_BASE_URL ?? "https://api.hypercli.com/v1";

if (!apiKey) throw new Error("HYPERCLI_API_KEY manquante");

/**
 * Client LLM unique du projet — Hypercli (Kimi K2.6), endpoint OpenAI-compatible.
 * Factory centralisée : ne jamais instancier un client LLM ailleurs (cf. CLAUDE.md).
 */
export const kimiClient = new OpenAI({ apiKey, baseURL });

/** Modèle conversationnel/agentique par défaut. */
export const KIMI_MODEL = process.env.HYPERCLI_DEFAULT_MODEL || "kimi-k2.6";
