# GPU & Training Inventory

> Audit read-only. Aucun job lancé, aucun serveur modifié. Date : 2026-06-01.
> Sources : INFRA.md, SERVICES.md, Hedge engine code, MySwarms .env.local.

---

## Machines GPU

### GPU1 — WSL2 Ubuntu 24.04 (DESKTOP-8IIMMDD)

| Champ | Valeur |
|---|---|
| LAN | 192.168.1.200 |
| Tailscale | 100.88.191.49 |
| SSH aliases | `gpu1`, `gpu1-ts`, `ubuntu-comput3`, `gpu1-lan` |
| User | comput3 |
| GPU | 4× RTX 4090 (49 140 MiB VRAM chacun) |
| VRAM au moment de l'audit | GPU0: 91%, GPU1: 57%, GPU2: libre, GPU3: 99% |
| Disque | ext4 83% utilisé |
| Statut | Actif — charge GPU0/GPU3 élevée |

**Services Docker actifs :**
| Container | Port | Modèle | docker-compose |
|---|---|---|---|
| `openclaw-vllm-reasoning` | 8003 | Qwen2.5-Coder (reasoning) | `openclaw/OpenClawServer/` |
| `openclaw-vllm-coding` | 8000 | Qwen2.5-Coder (coding) | `openclaw/OpenClawServer/` |
| `openclaw-vllm-fast` | 8001 | Qwen2.5-Coder (fast) | `openclaw/OpenClawServer/` |
| `openclaw-vllm-embeddings` | 8002 | (embeddings) | `openclaw/OpenClawServer/` |
| `openclaw-postgres` | 5433 | pgvector:pg16 | `openclaw/OpenClawServer/` |
| `openclaw-redis` | — | Redis (0.0.0.0) | `openclaw/OpenClawServer/` |
| `hearst-redis` | — | Redis (0.0.0.0) | stack Hearst |
| `hearst-tunnel` | — | cloudflared 2026.2.0 (token tunnel supprimé ⚠) | stack Hearst |

**GPU1 peut accueillir un batch embedding léger sur GPU2 (57% libre, ~24 GB VRAM disponibles).**

---

### GPU2 — Ubuntu 24.04 natif

| Champ | Valeur |
|---|---|
| LAN | 192.168.1.150 |
| Tailscale | 100.110.74.114 |
| SSH aliases | `gpu2`, `gpu2-remote` |
| User | comput3 |
| GPU | 4× RTX 4090 (49 140 MiB VRAM chacun) |
| VRAM au moment de l'audit | GPU0: 97%, GPU1: 97%, GPU2: 93%, GPU3: 95% |
| CPU load | 13+ (anormalement élevé) |
| Statut | Actif — saturé, à ne pas surcharger |

**Services Docker actifs :**
| Container | Port | Modèle | docker-compose |
|---|---|---|---|
| `vllm-coding` | 8000 | Qwen2.5-Coder-32B-AWQ | `vllm-stack/` |
| `vllm-fast` | 8001 | Qwen2.5-Coder-7B-AWQ | `vllm-stack/` |
| `vllm-embeddings` | host | nomic-embed | `vllm-stack/` |
| `vllm-hearst` | host | (hearst config) | `vllm-stack/` |
| `comfyui` | 8188 | SD/FLUX | `comfyui-data/` |
| `openclaw-*` | — | OpenClaw backend | `myclaw/infra/openclaw/` |
| `cloudflared` | — | cloudflared 2026.3.0 | `myclaw/infra/gpu2/` |

**Services systemd actifs :**
- `invokeai.service` → port 9090 (InvokeAI Community Edition)

**GPU2 est saturé. À utiliser uniquement pour des appels ponctuels à `vllm-embeddings` (charge très faible).**

---

## Variables d'environnement GPU/ML

### MySwarms — `.env.local` (lignes 137-140)
```
COMFY_BASE=http://127.0.0.1:8188
STUDIO_INVOKE_BACKEND=http://127.0.0.1:9090
STUDIO_SSH_HOST=gpu2-remote
```
Ces vars sont déclarées mais **aucune route MySwarms ne les consomme activement** (présence déclarative, pas de fonctionnalité câblée).

### Hedge engine — `config.py`
```python
vllm_base_url_reasoning: str = "http://localhost:8000/v1"  # Qwen2.5-Coder-32B
vllm_base_url_fast: str = "http://localhost:8001/v1"       # Qwen2.5-Coder-7B
vllm_api_key: str = "vllm-local-key"
```
Hedge fait tourner vLLM en local (port-forwarding SSH ou LAN direct). **MySwarms n'utilise pas ces endpoints.**

---

## Modèles identifiés

| Modèle | Taille | Format | Location | Utilisé par |
|---|---|---|---|---|
| Qwen2.5-Coder-32B-AWQ | ~20 GB | AWQ quantized | GPU2 vllm-coding | Hedge engine (reasoning) |
| Qwen2.5-Coder-7B-AWQ | ~5 GB | AWQ quantized | GPU2 vllm-fast | Hedge engine (fast path) |
| nomic-embed | ~0.5 GB | — | GPU2 vllm-embeddings | OpenClaw / non câblé MySwarms |
| Qwen2.5-Coder (×3 instances) | 7B+32B | — | GPU1 openclaw | OpenClaw (projet séparé) |
| SD / FLUX | — | — | GPU2 ComfyUI | Studio image generation |
| SD | — | — | GPU2 InvokeAI | Studio image generation |
| kimi-k2.6 | cloud | — | Hypercli API | MySwarms CrewAI engine |
| qwen3-embedding-4b | cloud | — | Hypercli API | MySwarms embeddings |

**Aucun modèle fine-tuné, aucun checkpoint custom, aucun dataset propriétaire identifié.**

---

## Scripts training / batch / pipeline

**Résultat : NÉANT.**

Aucun script de training, fine-tuning, LoRA/QLoRA, pipeline dataset, job batch, cron ML n'a été identifié dans :
- `/Users/adrienbeyondcrypto/Dev/Projects/Hedge/`
- `/Users/adrienbeyondcrypto/Dev/Hearst Corporation/hive-front-swarms/`
- `/Users/adrienbeyondcrypto/Desktop/Local Server/INFRA.md`

Tous les GPU sont utilisés pour **inférence uniquement**.

---

## Tunnels SSH (pattern d'accès)

Pour accéder aux services GPU localement depuis le Mac :

```bash
# ComfyUI (GPU2)
ssh -L 8188:localhost:8188 gpu2-remote -N &

# InvokeAI (GPU2)
ssh -L 9090:localhost:9090 gpu2-remote -N &

# vLLM Hedge / Automobile embeddings (GPU2)
ssh -L 8000:localhost:8000 gpu2-remote -N &  # coding 32B
ssh -L 8001:localhost:8001 gpu2-remote -N &  # fast 7B
# note : host network → port direct

# vLLM OpenClaw embeddings (GPU1)
ssh -L 8002:localhost:8002 gpu1 -N &         # embeddings GPU1
```

---

## Risques de sécurité

| Risque | Criticité | Action recommandée |
|---|---|---|
| Redis `hearst-redis` + `openclaw-redis` écoute sur 0.0.0.0 | Élevée | Restreindre à 127.0.0.1 ou réseau Docker interne uniquement |
| InvokeAI exposé via `invoke.hearst.app` sans auth native | Moyenne | Activer Cloudflare Access sur la route ou ajouter auth HTTP Basic |
| Container `hearst-tunnel` (GPU1) avec token tunnel supprimé | Faible | Stopper le container, supprimer credential JSON orphelin |
| cloudflared GPU1 v2026.2.0 vs cible v2026.5.0 | Faible | Mettre à jour cloudflared sur GPU1 |
| Container cloudflared GPU2 run en root (`user: "0"`) | Faible | Workaround connu credential file permissions — documenter ou corriger |

---

## Capacité disponible pour Automobile

| GPU | VRAM libre estimée | Usage potentiel Automobile |
|---|---|---|
| GPU1 GPU2 | ~24 GB | Batch embeddings nomic-embed (~2 GB par job) — jusqu'à 12 jobs parallèles |
| GPU2 vllm-embeddings | port host, ~3 GB utilisés | Appels ponctuels, charge faible |
| GPU2 vllm-coding/fast | 93-97% — éviter | Ne pas surcharger, Hedge en prod |

**Recommandation opérationnelle** : programmer les jobs Automobile sur GPU1 GPU2 (57% libre) entre 2h et 6h du matin. Batch size ≤ 500 annonces par run. Surveiller VRAM avant chaque run via `nvidia-smi`.

---

## Connexion à Swarm Platform

**Actuellement : aucune.** Les GPU locaux ne sont pas exposés à la Swarm Platform. Pour câbler :

1. Créer un endpoint `POST /api/automobile/embed` dans MySwarms
2. Cet endpoint ouvre un tunnel SSH temporaire vers `gpu2-remote` ou appelle directement sur LAN
3. Appelle `http://localhost:8002/v1/embeddings` (nomic-embed GPU1) ou `vllm-embeddings` GPU2
4. Stocke les vecteurs dans Supabase pgvector (table `vehicle_embeddings` à créer)

Effort estimé : 1 jour (endpoint + ssh tunnel helper + table Supabase). Valeur : dédup sémantique cross-annonces sans coût Hypercli.

---

*Inventaire uniquement. Aucun job GPU lancé, aucun serveur modifié, aucune consommation GPU.*
