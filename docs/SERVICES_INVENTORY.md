# MySwarms — Connected Services Inventory

Factual map of what is wired to the platform. **Confirmed** = found in code/env and
verified by reading the module. **Mentioned** = named in docs/UI only, not wired.
**Unknown** = no reference anywhere in the repo. No secret values are listed — env
var **names** only. Generated during the production hardening closeout.

## Platform stats (control-plane DB `fxeibmjebvxtoazuyyvz`, read-only snapshot)

| Metric | Value |
|---|---|
| Users (`auth.users`) | 2 |
| Distinct owners with swarms | 2 |
| Swarms total | 18 (10 owned · **8 owner-null templates**) |
| Swarm runs total | 37 (16 owned · **21 owner-null** — legacy/template runs, fail-closed under R1/R2) |
| Chief runs (`chief_run_log`) | 107 |
| Chief runs with `langfuse_trace_id` | **0** — dead plumbing; this lot starts populating it (see Track 3) |

## Service table

| Service / Platform | Status | Entry point | Auth | Data / tools | Env vars (names only) | Risk / notes |
|---|---|---|---|---|---|---|
| **MySwarms BFF** (Next.js) | Confirmed | `src/app/**` on Vercel (`myswarms`); `src/middleware.ts` | User session (Supabase) → mints HS256 JWT (`src/lib/crewai/internal-auth.ts`, iss `myswarms-bff`, aud `crewai-engine`, TTL 300s) | Proxies to engine; reads Supabase/Upstash/APM/Apify | `CREWAI_ENGINE_URL`, `CREWAI_ENGINE_AUTH_TOKEN`, `CREWAI_ENGINE_JWT_SECRET`, `CREWAI_ENGINE_TIMEOUT_MS`, `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `DEV_BYPASS_AUTH`, `DEV_BYPASS_OWNER_ID`, `ALLOWED_EMAIL`, `SUPER_ADMIN_EMAIL` | `DEV_BYPASS_AUTH`/`DEV_BYPASS_OWNER_ID` exist — must stay OFF in prod (flagged by in-repo truth audit) |
| **crewai-engine** (FastAPI) | Confirmed | `services/crewai-engine/src/main.py` on Railway | **Dual**: global `Bearer CREWAI_ENGINE_AUTH_TOKEN` (all routes but `/health`) **+** owner-scoped `X-Internal-Auth` JWT (`security/internal_auth.py`, fail-closed prod) | Orchestrates CrewAI flows/crews | `CREWAI_ENGINE_AUTH_TOKEN`, `CREWAI_ENGINE_JWT_SECRET`, `CREWAI_ENGINE_ALLOWED_ORIGINS`, `RAILWAY_ENVIRONMENT` | Owner identity = JWT only (anti-spoof). No GitHub auto-deploy → manual `railway up` |
| **Supabase (main)** `fxeibmjebvxtoazuyyvz` | Confirmed | BFF `src/lib/supabase/*`; engine `persistence/*.py` | BFF anon (RLS) + service-role (admin). **Engine uses service-role → bypasses RLS** | `swarms`, `swarm_*`, `tools`, `chief_*` | Owner isolation enforced in app code (`owner_scope.py`, `external_account_scope.py`, `vault_scope.py`) — R1/R3/R2/R5/R6 |
| **Supabase (APM market)** `ipgqjrsvcqqmnihasxae` | Confirmed | BFF `src/lib/market/apmClient.ts` | Separate Supabase apikey + Bearer | Read-only `market_index` (price medians, velocity…) | **Strict data-only frontier** — only numbers cross; no APM code imported |
| **Composio** | Confirmed | `services/crewai-engine/src/composio_session.py` + `agents/definitions.py` | API key + per-owner entity (`external_account_scope.resolve_composio_entity`) | toolkits: gmail, slack, telegram, googlecalendar, notion | `COMPOSIO_API_KEY`, `COMPOSIO_USER_ID`, `COMPOSIO_CALLBACK_URL` | R5: owner-scoped, no Adrien fallback in prod |
| **Telegram** | Confirmed | `services/crewai-engine/src/tools/telegram_sender.py` | Bot token; owner-scoped chat (`resolve_telegram_chat`) | Owner DM, security-level gated | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Fail-closed if no chat mapped; LLM-supplied chat_id ignored |
| **Cortex / Vault** | Confirmed | `services/crewai-engine/src/tools/vault_search.py` → `POST {CORTEX_URL}/api/search` | `x-api-key`; owner-scoped namespace (`vault_scope.resolve_vault_namespace`) | RAG over private notes | `CORTEX_URL`, `CORTEX_API_KEY` | R6 fail-closed. **`CORTEX_URL`/`CORTEX_API_KEY` ABSENT in prod → VaultSearch fail-soft for all today** |
| **Langfuse** | Confirmed | `services/crewai-engine/src/observability/langfuse_setup.py` (OTel auto-instrument) | Public/secret keypair | LLM/agent trace export | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` | Fail-soft if keys absent. `trace_id` now captured into `langfuse_trace_id` (this lot) |
| **Sentry** | Confirmed | engine `main.py`; BFF `instrumentation*.ts` | DSN | Error/trace capture | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Fail-soft |
| **Upstash Redis** | Confirmed | BFF `src/lib/utils/rate-limit.ts`, `src/lib/apify/autoscout.ts` | REST Bearer | Rate-limit + scrape cache | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | BFF-only |
| **Apify (AutoScout24)** | Confirmed | BFF `src/lib/apify/*` | `APIFY_TOKEN` | Used-car listings scrape | `APIFY_TOKEN` | Token read lazily, never at build |
| **Browserbase** | Confirmed | engine `providers/listings_browserbase.py` (`POST /v1/listings`) | API key + project id | Headless scrape (bienici) | `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | `/v1/listings` is **global-bearer only, NOT owner-scoped** (triggers paid remote browser) |
| **Hypercli (Kimi K2.6)** | Confirmed | engine `config.py` LLM; BFF `src/lib/llm/kimi.ts` | API key + base URL | Sole LLM provider | `HYPERCLI_API_KEY`, `HYPERCLI_BASE_URL`, `HYPERCLI_DEFAULT_MODEL` | `ANTHROPIC_/OPENAI_` keys declared but unused on nominal path |
| **Resend** | Mentioned | UI string in `src/app/settings/page.tsx` only | — | — | (none wired) | Named in UI/SERVICES.md, **not wired** in repo |
| **GPU1/GPU2 inference** | Mentioned | env vars declared in `.env.local`/docs | — | — | `COMFY_BASE`, `STUDIO_INVOKE_BACKEND`, `STUDIO_SSH_HOST` | Declarative; no MySwarms route consumes them (serve Hedge/OpenClaw) |
| **ADPILOT** | Unknown | — | — | — | — | **Zero references** in src/services/docs. Closest real link = the APM market data-only client |
| **Hearst Connect** | Unknown | — | — | — | — | **Zero references** in repo |
| **Hearst AI** | Unknown | — | — | — | — | **Zero references** in repo |
| **Earth Connect** | Unknown | — | — | — | — | **Zero references** in repo |

## Summary

- **Confirmed (wired):** BFF, crewai-engine, Supabase ×2 (main + APM market), Composio, Telegram, Cortex/Vault, Langfuse, Sentry, Upstash, Apify, Browserbase, Hypercli.
- **Mentioned only:** Resend (UI copy), GPU1/GPU2 (declarative env).
- **Unknown / absent:** ADPILOT, Hearst Connect, Hearst AI, Earth Connect — none exist in this repo; do not assume a connection.

## Notable findings for follow-up

1. **`/v1/listings` (Browserbase) is global-bearer only** — not owner-scoped. It triggers paid remote browser sessions; consider owner-scoping or a quota if it becomes user-reachable.
2. **`DEV_BYPASS_AUTH` / `DEV_BYPASS_OWNER_ID`** exist in the BFF — confirm they are unset/false in Vercel production.
3. **Cortex not wired in prod** (`CORTEX_URL`/`CORTEX_API_KEY` absent) — VaultSearch is fail-soft-disabled platform-wide; the R6 owner gate is correct regardless, but Adrien's retrieval is non-functional until Cortex is wired.
4. **21 owner-null swarm_runs** remain (legacy/template) — fail-closed under R1/R2 (not cross-tenant readable), but worth a one-time audit.
5. **Two Supabase projects** — do not conflate the main control-plane DB with the read-only APM market DB.
