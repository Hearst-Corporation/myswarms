/**
 * Hugging Face Inference API — client central.
 *
 * Server-only. Toutes les capabilities HF (embeddings, rerank, NER, sentiment,
 * vision, OCR) passent par ce client. Clé via HUGGINGFACE_API_KEY (jamais
 * hardcodée). Gère :
 *  - auth Bearer
 *  - cold start (503 + estimated_time) avec retry borné
 *  - timeouts (AbortSignal)
 *  - basculement futur vers un endpoint self-host GPU2 via HF_INFERENCE_BASE_URL
 *
 * Le design reste proche du contrat OpenAI-compatible utilisé pour Hypercli :
 * un seul point d'entrée, configurable par env, sans secret en dur.
 */

import "server-only";

const BUILD_TIME = process.env.NEXT_PHASE === "phase-production-build";

/**
 * Base URL de l'Inference API (overridable pour pointer un TEI/vLLM GPU2).
 * HF a migré l'ancien `api-inference.huggingface.co` vers le router
 * `router.huggingface.co/hf-inference` (Inference Providers). On utilise le
 * provider hf-inference par défaut ; override via HF_INFERENCE_BASE_URL.
 */
function baseUrl(): string {
  return (
    (process.env.HF_INFERENCE_BASE_URL ?? "").trim() ||
    "https://router.huggingface.co/hf-inference/models"
  );
}

function apiKey(): string {
  const key = process.env.HUGGINGFACE_API_KEY ?? (BUILD_TIME ? "build-placeholder" : "");
  if (!key) {
    throw new HfError("HUGGINGFACE_API_KEY manquante", { status: 0, model: "", retriable: false });
  }
  return key;
}

export interface HfErrorMeta {
  status: number;
  model: string;
  retriable: boolean;
  body?: string;
}

export class HfError extends Error {
  readonly status: number;
  readonly model: string;
  readonly retriable: boolean;
  readonly body?: string;
  constructor(message: string, meta: HfErrorMeta) {
    super(message);
    this.name = "HfError";
    this.status = meta.status;
    this.model = meta.model;
    this.retriable = meta.retriable;
    this.body = meta.body;
  }
}

const DEFAULT_TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS ?? "30000");
const MAX_RETRIES = Number(process.env.HF_MAX_RETRIES ?? "2");
const COLD_START_WAIT_MS = Number(process.env.HF_COLD_START_WAIT_MS ?? "4000");

interface CallOpts {
  /** Payload JSON envoyé tel quel à l'Inference API. */
  inputs: unknown;
  parameters?: Record<string, unknown>;
  options?: Record<string, unknown>;
  /** Body binaire (image) — exclusif avec inputs JSON. */
  binary?: Uint8Array;
  contentType?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Appel bas-niveau d'un modèle de l'Inference API.
 * Retourne le JSON parsé (ou texte si non-JSON). Lève HfError sinon.
 */
export async function hfCall<T = unknown>(model: string, opts: CallOpts): Promise<T> {
  const url = `${baseUrl()}/${model}`;
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let lastErr: HfError | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    // Lie le signal externe à l'abort interne.
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const isBinary = opts.binary != null;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": opts.contentType ?? (isBinary ? "application/octet-stream" : "application/json"),
      };
      const body: BodyInit = isBinary
        ? new Blob([(opts.binary as Uint8Array).buffer as ArrayBuffer])
        : JSON.stringify({
            inputs: opts.inputs,
            ...(opts.parameters ? { parameters: opts.parameters } : {}),
            // wait_for_model => l'API attend la chauffe au lieu de renvoyer 503.
            options: { wait_for_model: true, ...(opts.options ?? {}) },
          });

      const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
      clearTimeout(timer);

      const text = await res.text();
      if (res.ok) {
        try {
          return JSON.parse(text) as T;
        } catch {
          return text as unknown as T;
        }
      }

      // Cold start / surcharge -> retriable.
      const retriable = res.status === 503 || res.status === 429 || res.status >= 500;
      lastErr = new HfError(`HF ${model} → HTTP ${res.status}`, {
        status: res.status,
        model,
        retriable,
        body: text.slice(0, 500),
      });
      if (!retriable || attempt === MAX_RETRIES) throw lastErr;
      await sleep(COLD_START_WAIT_MS * (attempt + 1));
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof HfError) {
        lastErr = err;
        if (!err.retriable || attempt === MAX_RETRIES) throw err;
        await sleep(COLD_START_WAIT_MS * (attempt + 1));
        continue;
      }
      // Abort/timeout/réseau -> retriable une fois.
      const aborted = (err as Error)?.name === "AbortError";
      lastErr = new HfError(
        aborted ? `HF ${model} → timeout (${timeout}ms)` : `HF ${model} → ${(err as Error)?.message ?? "network error"}`,
        { status: 0, model, retriable: true },
      );
      if (attempt === MAX_RETRIES) throw lastErr;
      await sleep(COLD_START_WAIT_MS * (attempt + 1));
    }
  }
  throw lastErr ?? new HfError(`HF ${model} → échec inconnu`, { status: 0, model, retriable: false });
}

/** Vrai si la clé HF est configurée (pour les health checks / disabled states). */
export function isHfConfigured(): boolean {
  return Boolean((process.env.HUGGINGFACE_API_KEY ?? "").trim());
}
