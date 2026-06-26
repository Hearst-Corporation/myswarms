# Opportunités Hugging Face pour MySwarms

> HF en **périphérie** : embeddings, rerankers, NER/extraction, vision, OCR, sentiment finance, datasets.
> Le chat/LLM principal reste **Hypercli / Kimi K2.6** (CLAUDE.md). HF ne remplace PAS l'orchestration LLM.
> Pattern d'intégration standard : self-host sur **GPU2** (4× RTX 4090, vLLM/TEI en endpoint OpenAI-compatible derrière `crewai-engine`) ou **Inference API HF** (compte PRO) pour prototype/burst.

---

## 1. TL;DR — les 5 plus gros leviers

1. **`BAAI/bge-m3` + `BAAI/bge-reranker-v2-m3`** : pipeline RAG hybride (dense+sparse 8192 tokens) + reranking multilingue FR natif. Le duo de référence (MIT/Apache, 31M+16M dl) pour la mémoire des agents CrewAI.
2. **`urchade/gliner_multi-v2.1`** : NER zero-shot FR/EN piloté par labels en langage naturel — cœur de l'extraction d'annonces Automobile/APM et Real-estate, sans réentraînement par verticale.
3. **`rednote-hilab/dots.ocr` + `deepseek-ai/DeepSeek-OCR`** : extraction structurée JSON depuis PDF/captures d'annonces (LeBonCoin, La Centrale, SeLoger) — finesse layout (dots) + débit batch (DeepSeek).
4. **`Qwen/Qwen2.5-VL-7B-Instruct`** : VLM vision véhicule en un appel (marque/modèle/couleur/état/texte visible → JSON), self-host AWQ sur une 4090, même pattern OpenAI-compatible que Hypercli.
5. **`ElKulako/cryptobert` + `ProsusAI/finbert` + `amazon/chronos-bolt-base`** : signal sentiment crypto+finance et forecast time-series zero-shot pour Hedge (feature d'aide, jamais déclencheur d'ordre — no-trade-by-default reste maître).

---

## 2. P0 — à intégrer en priorité

| Repo | Type | Usage MySwarms | Intégration |
|---|---|---|---|
| `BAAI/bge-m3` | embedding | RAG/mémoire agents : dense+sparse+ColBERT, 8192 tok, FR solide. Meilleur rappel sur jargon court (specs véhicule, termes Hedge) | self-host GPU2 vLLM/FlagEmbedding (~2.3 GB) OpenAI-compat ; pgvector 1024 dense + tsvector sparse |
| `Qwen/Qwen3-Embedding-0.6B` | embedding | Même famille que qwen3-embedding-4b (Hypercli) en **local** : fallback conforme + indexation batch volume Automobile | self-host GPU2 vLLM `/embeddings` (~1.2 GB) ; MRL tronqué 512/768 dims |
| `BAAI/bge-reranker-v2-m3` | reranker | Reranking RAG par défaut tous agents : top-50 vecteurs → top-5/8 réels avant contexte Kimi. Réduit bruit/hallucinations | self-host GPU2 vLLM/TEI (~1.5 GB) endpoint `/rerank` ; Apache-2.0 |
| `Qwen/Qwen3-Reranker-0.6B` | reranker | Reranker premium instruction-aware, même écosystème que l'embedding qwen3 (alignement sémantique) | self-host GPU2 vLLM ; préférer variante seq-cls (`tomaarsen/Qwen3-Reranker-0.6B-seq-cls`) pour scoring rapide |
| `urchade/gliner_multi-v2.1` | NER | Extraction annonces véhicule/immo zero-shot (labels: marque, modèle, km, prix, année…) ; structuration briefs Chief of Staff | self-host GPU2 (lib `gliner`, ~500 MB, CPU/GPU) microservice FastAPI — pas d'Inference API pour labels custom |
| `Jean-Baptiste/camembert-ner` | NER | Baseline FR fiable : adresses/LOC/ORG sur annonces et emails Chief of Staff quand GLiNER trop large | Inference API HF (token-classification) ; self-host GPU2 si volume (~440 MB) |
| `rednote-hilab/dots.ocr` | OCR/VLM | Parser de référence annonces auto/immo PDF/capture → JSON {prix, km, année, surface, DPE…} + bbox. Petit, rapide | self-host GPU2 vLLM (~1×4090) tool `parse_listing` ; GGUF dispo |
| `deepseek-ai/DeepSeek-OCR` | OCR/VLM | Ingestion de masse : lots PDF fiches techniques/diagnostics → Markdown propre pour NER aval. Haut débit batch nocturne | self-host GPU2 vLLM/transformers (~3B, MIT) pipeline batch via crewai-engine |
| `PaddlePaddle/PaddleOCR-VL` | OCR/VLM | Backup léger de dots.ocr, excellent sur tables (grilles prix/options par finition) | self-host GPU2 (~0.9B) ou GGUF quantisé (CPU/llama.cpp) failover |
| `Qwen/Qwen2.5-VL-7B-Instruct` | vision/VLM | Pivot vision APM : photo → marque/modèle/couleur/carrosserie/état/texte visible en JSON | self-host GPU2 vLLM AWQ (`-AWQ`) OpenAI-compat derrière crewai-engine ; Apache-2.0 |
| `morsetechlab/yolov11-license-plate-detection` | détection | Étape 1 plaque : localiser pour anonymisation RGPD + crop avant OCR | self-host GPU2 (ultralytics, très léger) micro-endpoint FastAPI ; ⚠️ licence AGPL — OK self-host interne |
| `ElKulako/cryptobert` | sentiment | Sentiment social crypto (jargon HODL/FUD/moon/rug) par actif → feature Risk/Signal Engine Hedge | Inference API HF (text-classification) P0 ; self-host GPU2 si volume (~125 MB). Log softmax dans Langfuse |
| `ProsusAI/finbert` | sentiment | Sentiment finance « sérieuse » (news macro/headlines) ; 2e vue ensembling vs CryptoBERT | Inference API HF ; self-host trivial. Pondérer : news=FinBERT, social=CryptoBERT |

---

## 3. P1 — utile

| Repo | Type | Usage MySwarms | Intégration |
|---|---|---|---|
| `intfloat/multilingual-e5-large-instruct` | embedding | Retrieval instruction-driven (« Find emails about X ») collé au tool-use Chief of Staff | self-host GPU2 (~2.2 GB) ; ⚠️ 512 tok → chunking (préférer bge-m3 sur long) |
| `Alibaba-NLP/gte-multilingual-base` | embedding | « Cheval de trait » faible latence/coût : indexation volume Automobile, flux Hedge quasi-temps réel (768d, 8192 tok) | self-host GPU2 (<1 GB, throughput élevé) ; pgvector 768 ; paire `gte-multilingual-reranker-base` |
| `OrdalieTech/Solon-embeddings-large-0.1` | embedding | Spécialiste FR pur pour corpus 100% francophones (annonces/immo FR) — A/B vs bge-m3 | self-host GPU2 (~1.3 GB) ; index FR-only séparé |
| `Alibaba-NLP/gte-reranker-modernbert-base` | reranker | Reranking passages longs 8192 tok (annonces/contextes Hedge) — flux majoritairement EN | self-host GPU2 ou ONNX CPU ; Apache-2.0 |
| `mixedbread-ai/mxbai-rerank-base-v2` | reranker | Reranking fort sur code/données structurées (specs auto, données financières Hedge) | self-host GPU2 (lib mxbai-rerank / ST) ; Apache-2.0 |
| `cross-encoder/ms-marco-MiniLM-L6-v2` | reranker | Filtrage rapide CPU/fallback (top-100→top-20) flux EN | ONNX runtime CPU (Vercel/Railway-friendly) ; ⚠️ EN-only |
| `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` | reranker | Reranking léger FR/multilingue bas coût (UI/annonces/immo FR) | self-host CPU/GPU2 ST CrossEncoder ; Apache-2.0 |
| `Jean-Baptiste/camembert-ner-with-dates` | NER | Dates/échéances dans emails FR (calendrier Chief of Staff) ; année mise en circulation | Inference API HF ; normaliser ISO avec `dateparser` en post-traitement |
| `knowledgator/gliner-multitask-large-v0.5` | NER | Extraction attribut→valeur + relations (puissance, finition, options) annonces véhicule | self-host GPU2 (lib gliner, ~1.5 GB) ; tester précision FR avant prod |
| `urchade/gliner_multi_pii-v1` | NER/PII | Redaction RGPD : masquer PII (vendeur, coordonnées, IBAN, plaques) avant prompt Hypercli/insert DB | self-host GPU2 ; pré-filtre dans BFF Next.js ou crewai-engine |
| `Babelscape/wikineural-multilingual-ner` | NER | NER multilingue robuste (fr/de/es/it/nl) pour imports véhicule UE non-FR | Inference API HF ; self-host GPU2 (~700 MB) |
| `microsoft/trocr-base-printed` | OCR | OCR ciblé crops : VIN, kilométrage tableau de bord, plaque après détection | Inference API HF (image-to-text) ou self-host GPU2 ; coupler à un détecteur de zones |
| `microsoft/Florence-2-large` | vision/OCR | Couteau suisse vision auto : OCR + détection + grounding plaque en 1 modèle (MIT, 0.77B) | self-host GPU2 (transformers, trust_remote_code) ou Inference API |
| `hustvl/yolos-tiny` | détection | Étape 0 photos annonce : cadrer le véhicule principal, rejeter photos sans voiture (QA) | Inference API HF (object-detection) ou self-host GPU2 ; pas d'AGPL |
| `anonauthors/stanford_cars-ConvNeXt-base` | classif | Reco marque/modèle/année depuis photo → pré-remplissage + anti-fraude (modèle déclaré ≠ reconnu) | Inference API HF ; ⚠️ Stanford Cars US ~2012 → fine-tune catalogue EU à prévoir |
| `beingamit99/car_damage_detection` | classif | Scoring état carrosserie (intact/rayé/bosselé) pour pricing APM + flag incohérences | Inference API HF (image-classification) plug-and-play |
| `keremberke/yolov5m-license-plate` | détection | Alternative MIT-friendly détection plaque, A/B vs YOLOv11 | self-host GPU2 (lib yolov5) micro-endpoint FastAPI |
| `zai-org/GLM-OCR` | OCR/VLM | Tier « hard cases » de la cascade OCR (scan dégradé, manuscrit, multi-colonnes dense) | self-host GPU2 vLLM ou Inference API à la demande ; MIT |
| `allenai/olmOCR-2-7B-1025-FP8` | OCR/VLM | PDF longs haute fidélité (rapports inspection, baux) → Markdown pour embedding RAG | self-host GPU2 vLLM FP8 (~1×4090) |
| `datalab-to/chandra-ocr-2` | OCR/VLM | Pipeline clé-en-main PDF immo (Surya+Marker+Chandra) : tables, plans, grilles de charges | self-host GPU2 via lib `marker`/datalab |
| `amazon/chronos-bolt-base` | forecast | Forecast prix/volatilité crypto Hedge zero-shot (quantiles → risque VaR-like). Apache-2.0 prod | self-host GPU2 autogluon/chronos (service Python) ; feature d'aide, jamais ordre seul |
| `google/timesfm-2.5-200m-transformers` | forecast | 2e forecaster Hedge en backtest/ensembling ; désaccord = signal d'incertitude → réduire expo | self-host GPU2 (200M) ; garder 1 seul en prod après backtest |
| `cardiffnlp/twitter-roberta-base-sentiment-latest` | sentiment | Sentiment social généraliste (Fed, ETF, cashtags) pré-filtre avant CryptoBERT | Inference API HF ; complément, pas remplacement |

---

## 4. Par domaine — top 3

### Orchestration agents (CrewAI Chief of Staff, RAG, mémoire)
1. **`BAAI/bge-m3`** — embedding hybride dense+sparse 8192 tok, mémoire/RAG de référence multilingue FR.
2. **`BAAI/bge-reranker-v2-m3`** — reranking par défaut tous agents (top-50 → top-5/8) avant contexte Kimi.
3. **`Qwen/Qwen3-Embedding-0.6B`** — même famille que l'embedding Hypercli, self-host local = fallback conforme + batch.

### Automobile / APM (extraction annonces, vision, pricing, specs)
1. **`urchade/gliner_multi-v2.1`** — NER zero-shot specs/prix/localisation, labels variables par verticale.
2. **`Qwen/Qwen2.5-VL-7B-Instruct`** — photo annonce → fiche véhicule JSON en un appel (marque/état/texte).
3. **`rednote-hilab/dots.ocr`** — PDF/capture annonce → JSON structuré + bbox (tool `parse_listing`).
   *(+ pipeline plaque RGPD : `morsetechlab/yolov11-license-plate-detection` → crop → `microsoft/trocr-base-printed`.)*

### Real-estate (tenant) + Finance Hedge
1. **`ElKulako/cryptobert`** — sentiment social crypto par actif, feature Risk/Signal Engine Hedge.
2. **`amazon/chronos-bolt-base`** — forecast prix/volatilité zero-shot (quantiles → risque), Apache-2.0.
3. **`datalab-to/chandra-ocr-2`** — parsing PDF immo (diagnostics DPE, baux, grilles de charges) clé-en-main.
   *(+ `ProsusAI/finbert` pour le sentiment news macro, ensembling avec CryptoBERT par source.)*

### Transverse (RGPD, OCR généraliste, NER FR)
1. **`urchade/gliner_multi_pii-v1`** — redaction PII avant prompt LLM et insertion DB (control-plane multi-tenant).
2. **`Jean-Baptiste/camembert-ner`** — baseline NER FR robuste, Inference-API-friendly.
3. **`deepseek-ai/DeepSeek-OCR`** — ingestion de masse documents → Markdown, MIT, haut débit.

---

## 5. Quick wins — câblables cette semaine

**Via Inference API HF (zéro infra, compte PRO) :**
- **`ElKulako/cryptobert`** + **`ProsusAI/finbert`** : POST text-classification, 3 labels + softmax. Brancher dans le service sentiment Hedge, logger dans Langfuse. → signal sentiment opérationnel en quelques heures.
- **`Jean-Baptiste/camembert-ner`** : token-classification sur emails/annonces FR → extraction LOC/ORG/PER immédiate.
- **`beingamit99/car_damage_detection`** + **`anonauthors/stanford_cars-ConvNeXt-base`** : image-classification plug-and-play → premier scoring état + reco modèle pour flagging APM (pas pricing tant que non validé sur dataset interne).
- **`microsoft/trocr-base-printed`** : image-to-text sur crops (VIN, odomètre).

**Via TEI / vLLM sur GPU2 (1 service Python OpenAI-compatible derrière crewai-engine) :**
- **`BAAI/bge-m3`** (TEI embeddings) + **`BAAI/bge-reranker-v2-m3`** (TEI rerank) : monter le pipeline RAG hybride à 2 étages. Stocker dense 1024 en pgvector Supabase + colonne sparse/tsvector.
  ```bash
  # GPU2 — text-embeddings-inference, endpoint OpenAI-compatible
  docker run --gpus all -p 8080:80 ghcr.io/huggingface/text-embeddings-inference:latest \
    --model-id BAAI/bge-m3
  docker run --gpus all -p 8081:80 ghcr.io/huggingface/text-embeddings-inference:latest \
    --model-id BAAI/bge-reranker-v2-m3
  ```
- **`urchade/gliner_multi-v2.1`** : `pip install gliner`, micro-endpoint FastAPI `/extract` à côté de crewai-engine, labels passés par la verticale appelante.
- **`rednote-hilab/dots.ocr`** : vLLM en endpoint OpenAI-compatible, exposer un tool `parse_listing` aux agents Automobile/Real-estate.

**Pattern de câblage commun** : tout endpoint GPU2 suit le contrat OpenAI-compatible déjà utilisé pour Hypercli ; ajouter les URLs dans `.env.local` (jamais hardcodé) et router via `src/lib/llm/` (TS) ou `os.getenv()` (crewai-engine).

---

## 6. Datasets à télécharger (éval / fine-tuning)

| Dataset | Usage | Comment |
|---|---|---|
| `zeroshot/twitter-financial-news-sentiment` | Set gold (~12k tweets bull/bear/neutral) pour benchmarker objectivement FinBERT vs CryptoBERT vs cardiff et calibrer les seuils de décision Hedge | `datasets` HF download ; harness d'éval, pas d'inférence runtime |
| `SahandNZ/cryptonews-articles-with-price-momentum-labels` | Éval **causale** Hedge : tester si sentiment/news prédit réellement le momentum de prix (réponse directe au reproche OMEGA-RESET de cognition inerte/non-causale) | `datasets` download ; backtest sentiment→direction, joindre aux séries de prix Hedge |

**Méthodo** : ne PAS déployer un modèle sentiment/forecast par réputation. Backtester sur ces deux datasets + un échantillon réel Hedge avant de figer le choix en prod. Tracer accuracy + quantile-loss/MAE.

---

## Notes licences (bloquants prod commerciale)

- **À ÉVITER en prod** (CC-BY-NC-4.0, non-commercial) : `jinaai/jina-embeddings-v3`, `jinaai/jina-reranker-v2-base-multilingual`, `microsoft/layoutlmv3-base` (cc-by-nc-sa-4.0). → benchmark/R&D uniquement.
- **AGPL (ultralytics)** : `morsetechlab/yolov11-license-plate-detection`, `vineetsarpal/yolov11n-car-damage`. OK en self-host interne, attention à toute redistribution. Alternative MIT : `keremberke/yolov5m-license-plate`.
- **Gemma license** (restrictions Google) : `google/embeddinggemma-300m` — lire les conditions avant prod.
- **Safe (MIT / Apache-2.0)** : bge-m3, bge-reranker-v2-m3, qwen3-embedding/reranker, gte-*, dots.ocr, DeepSeek-OCR, GLM-OCR, Florence-2, Qwen2.5-VL, chronos-bolt, GOT-OCR-2.0, gliner, camembert-ner — privilégier ceux-ci par défaut.
