import OpenAI from "openai";

const BUILD_TIME = process.env.NEXT_PHASE === "phase-production-build";
const apiKey = process.env.OPENAI_API_KEY ?? (BUILD_TIME ? "build-placeholder" : undefined);
if (!apiKey) throw new Error("OPENAI_API_KEY manquante");

export const openaiClient = new OpenAI({ apiKey });

/** Modèle conversationnel — chat, rapide/économique. */
export const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o";

/** Modèle agentique — orchestration, tool-use, raisonnement complexe. */
export const OPENAI_AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-5.1";
