/**
 * TEI (Text Embeddings Inference) — client pour les modèles self-hostés GPU1.
 *
 * L'infra HF self-host de Hearst expose bge-m3 (embeddings) et bge-reranker-v2-m3
 * (reranking) via TEI, OpenAI-compatible, derrière le tunnel Cloudflare. C'est
 * la voie FIABLE (l'Inference API HF serverless est intermittente/dégradée).
 *
 * Endpoints (overridables par env) :
 *   - TEI_EMBED_URL   (def: https://embed.hearst.app)   -> /embed, /v1/embeddings
 *   - TEI_RERANK_URL  (def: https://rerank.hearst.app)  -> /rerank
 *   - TEI_API_KEY     : Bearer partagé (jamais hardcodé)
 *
 * Latence typique ~40 ms/embedding (4× RTX 4090, modèle chaud).
 */

import "server-only";
import { HfError } from "./client";

const DEFAULT_EMBED_URL = "https://embed.hearst.app";
const DEFAULT_RERANK_URL = "https://rerank.hearst.app";
const TIMEOUT_MS = Number(process.env.TEI_TIMEOUT_MS ?? "20000");

function embedUrl(): string {
  return (process.env.TEI_EMBED_URL ?? "").trim() || DEFAULT_EMBED_URL;
}
function rerankUrl(): string {
  return (process.env.TEI_RERANK_URL ?? "").trim() || DEFAULT_RERANK_URL;
}

/** Clé d'auth TEI (Bearer). Vide => header omis (TEI sans --api-key). */
function authHeader(): Record<string, string> {
  const key = (process.env.TEI_API_KEY ?? "").trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** TEI est-il configuré (au moins une URL non-default explicite ou clé) ? */
export function isTeiConfigured(): boolean {
  return Boolean(
    (process.env.TEI_EMBED_URL ?? "").trim() ||
      (process.env.TEI_API_KEY ?? "").trim(),
  );
}

async function teiPost<T>(url: string, path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new HfError(`TEI ${path} → HTTP ${res.status}`, {
        status: res.status,
        model: "tei",
        retriable: res.status >= 500 || res.status === 429,
        body: text.slice(0, 300),
      });
    }
    return JSON.parse(text) as T;
  } catch (err) {
    if (err instanceof HfError) throw err;
    const aborted = (err as Error)?.name === "AbortError";
    throw new HfError(aborted ? `TEI ${path} → timeout` : `TEI ${path} → ${(err as Error)?.message}`, {
      status: 0,
      model: "tei",
      retriable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Embeddings via TEI /embed (renvoie number[][] aligné sur les inputs). */
export async function teiEmbed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return teiPost<number[][]>(embedUrl(), "/embed", { inputs: texts, truncate: true });
}

export interface TeiRerankItem {
  index: number;
  score: number;
}

/** Rerank via TEI /rerank (renvoie [{index, score}] trié décroissant). */
export async function teiRerank(query: string, texts: string[]): Promise<TeiRerankItem[]> {
  if (texts.length === 0) return [];
  const raw = await teiPost<Array<{ index: number; score: number }>>(rerankUrl(), "/rerank", {
    query,
    texts,
    truncate: true,
  });
  return raw.map((r) => ({ index: r.index, score: r.score }));
}
