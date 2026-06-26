# Capacités Hugging Face — MySwarms

Câblage des capacités HF en **périphérie** de MySwarms. Le chat/LLM principal
reste **Hypercli/Kimi K2.6** (cf. CLAUDE.md) ; HF couvre embeddings, reranking,
NER, sentiment, vision/OCR, zero-shot.

> Catalogue complet des modèles évalués : [huggingface-opportunities.md](huggingface-opportunities.md).

## Architecture

```
Next.js (Vercel)  ──┐
                    ├─► src/lib/hf/*  ──► TEI GPU1 (embed.hearst.app / rerank.hearst.app)   [FIABLE]
crewai-engine ──────┘                 └─► Inference API HF (router.huggingface.co)          [best-effort]
```

- **Embeddings & reranking** : servis par **TEI self-host sur GPU1** (bge-m3 +
  bge-reranker-v2-m3), OpenAI-compatible, ~40 ms, exposés via tunnel Cloudflare.
  C'est la **voie nominale** (`isTeiConfigured()` → TEI prioritaire).
- **NER / sentiment / vision / zero-shot** : via l'**Inference API HF**
  (`router.huggingface.co/hf-inference`). ⚠️ Le serverless HF gratuit est
  **intermittent** (500/410 fréquents) — ces capacités sont *best-effort* et
  échouent proprement (`HfError`, retriable). À basculer sur self-host GPU1
  (vLLM) quand le besoin se confirme.

## Variables d'environnement

| Var | Rôle |
|---|---|
| `TEI_EMBED_URL` | Endpoint TEI embeddings (def: `https://embed.hearst.app`) |
| `TEI_RERANK_URL` | Endpoint TEI reranker (def: `https://rerank.hearst.app`) |
| `TEI_API_KEY` | Bearer partagé TEI (jamais hardcodé) |
| `HUGGINGFACE_API_KEY` | Clé Inference API HF (fallback NER/sentiment/vision) |
| `HF_INFERENCE_BASE_URL` | Override base Inference API (ex. self-host GPU1) |
| `HF_MODEL_<KEY>` | Override d'un modèle du registre (`src/lib/hf/models.ts`) |

Toutes présentes dans `.env.local` (gitignored), **Vercel** (prod/preview/dev)
et **Railway** (`crewai-engine`).

## API (Next.js, owner-scopé)

Toutes les routes exigent une session (`requireOwnerId` → 401) et renvoient 503
si HF non configuré.

| Route | Body | Sortie |
|---|---|---|
| `POST /api/hf/embed` | `{ texts[], model? }` | `{ vectors, dims, count }` |
| `POST /api/hf/rerank` | `{ query, documents[], topK?, model? }` | `{ results: [{index, score, document}] }` |
| `POST /api/hf/ner` | `{ text, variant?, minScore? }` | `{ entities, grouped }` |
| `POST /api/hf/sentiment` | `{ text, source? }` ou `{ news?, social?, ensemble:true }` | `{ label, score, raw }` ou `{ directional, parts }` |
| `POST /api/hf/vision` | `{ image(base64), task: ocr\|car_damage\|car_model }` | `{ task, text\|labels }` |
| `POST /api/hf/classify` | `{ text, labels[], multiLabel? }` | `{ labels, scores, top }` |
| `GET  /api/hf/health` | — | `{ configured, baseUrl, models }` |

## Usage côté serveur (TS)

```ts
import { embedTexts, rerank, analyzeSentiment, extractEntities } from "@/lib/hf";

// RAG : embeddings (TEI bge-m3, 1024d)
const vectors = await embedTexts(["voiture diesel 2019", "appartement T3 Paris"]);

// RAG : reranking top-N -> top-K
const ranked = await rerank("voiture diesel", candidates, { topK: 5 });

// Hedge : sentiment (FEATURE d'aide, jamais déclencheur d'ordre)
const s = await analyzeSentiment("Bitcoin surges to ATH", { source: "finance" });

// Automobile / Chief of Staff : extraction d'entités FR
const { grouped } = { grouped: groupEntities(await extractEntities("Vends BMW à Lyon")) };
```

## Règles

- Aucune clé hardcodée — tout via `process.env` (TS) / `os.getenv` (Python).
- Sentiment/forecast Hedge = **feature d'aide**, jamais un ordre. No-trade-by-default
  + kill switches restent maîtres. Tracer model/label/score dans Langfuse.
- Embeddings : bge-m3 (1024d) en parallèle de `qwen3-embedding-4b` (Hypercli) —
  ne pas mélanger les espaces vectoriels dans un même index pgvector.

## Reste à faire

- Exposer le **reranker** (`rerank.hearst.app` → GPU1:8086) via le dashboard
  Cloudflare (config tunnel managée à distance, non éditable par fichier local).
  Le code est prêt : dès que l'hostname répond, `rerank()` l'utilise.
- NER/vision : migrer vers self-host GPU1 (vLLM) si l'usage se confirme.
