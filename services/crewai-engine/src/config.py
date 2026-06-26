import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_boot_logger = logging.getLogger(__name__)

# Dual-mode .env loading :
#   - Dev local : override=True — un .env (symlink de .env.local) DOIT gagner
#     sur les variables shell exportées historiquement, sinon une vieille clé
#     dans le shell masque silencieusement la nouvelle valeur du fichier.
#   - Prod (Railway/Vercel/Render) : override=False — les env vars d'infra sont
#     LA source de vérité. Un éventuel .env packagé par erreur ne doit jamais
#     écraser les secrets injectés par la plateforme.
# Détection : la présence d'une variable d'env spécifique au PaaS suffit pour
# basculer en "prod-mode".
_IS_PROD_ENV = any(
    os.getenv(k)
    for k in ("RAILWAY_ENVIRONMENT", "RAILWAY_PROJECT_ID", "VERCEL_ENV", "RENDER")
)
_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
if _ENV_PATH.exists():
    load_dotenv(dotenv_path=_ENV_PATH, override=not _IS_PROD_ENV)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Internal auth between Next.js and crewai-engine — REQUIRED, no default
    CREWAI_ENGINE_AUTH_TOKEN: str = Field(..., min_length=32, description="Shared bearer token between Next.js and engine. Generate via `openssl rand -hex 32`.")

    # LLM providers
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    HYPERCLI_API_KEY: str = ""
    HYPERCLI_BASE_URL: str = "https://api.hypercli.com/v1"
    HYPERCLI_DEFAULT_MODEL: str = "kimi-k2.6"
    HYPERCLI_ANTHROPIC_MODEL: str = "kimi-k2.6-anthropic"

    # Tiers LLM (Hypercli / Kimi K2.6 — endpoint OpenAI-compatible, base_url=HYPERCLI_BASE_URL)
    # NOTE: tous les 3 tiers pointent sur le même modèle kimi-k2.6 (provider unique Hypercli).
    # Les noms fast/balanced/smart permettent une future différentiation via env sans changer le code.
    CREWAI_DEFAULT_FAST_MODEL: str = "openai/kimi-k2.6"
    CREWAI_DEFAULT_BALANCED_MODEL: str = "openai/kimi-k2.6"
    CREWAI_DEFAULT_SMART_MODEL: str = "openai/kimi-k2.6"

    # Résilience appels LLM Hypercli (litellm via crewai.LLM). Hypercli avait
    # été écarté en N-1 pour empty-responses/timeouts — retry exponentiel +
    # timeout explicite pour fiabiliser le crew Chief of Staff (8 agents).
    LLM_REQUEST_TIMEOUT_SECONDS: int = Field(
        default=120,
        gt=0,
        description="Timeout (s) par appel LLM Hypercli avant abandon.",
    )
    LLM_MAX_RETRIES: int = Field(
        default=3,
        ge=0,
        description="Nombre de retries (429/5xx) par appel LLM Hypercli (litellm num_retries).",
    )

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Langfuse
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

    # CORS — comma-separated JSON list of allowed origins.
    # Default: localhost only. Override in Railway prod env.
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3333"]

    # Telemetry
    CREWAI_DISABLE_TELEMETRY: bool = True

    # Mock mode — set to True in test/CI environments to skip LLM + API calls
    AGENT_MOCK_MODE: bool = False

    # Cortex RAG (vault search)
    CORTEX_URL: str = ""
    CORTEX_API_KEY: str = ""

    # Browserbase — scrape annonces immobilières (endpoint /v1/listings, HORS swarm).
    # Session headless distante (CDP) pilotée via Playwright connect_over_cdp.
    # Aucune valeur hardcodée — injectée via env (.env.local en dev, Railway en prod).
    BROWSERBASE_API_KEY: str = ""
    BROWSERBASE_PROJECT_ID: str = ""

    # Composio — multi-channel tools (Gmail, Slack, Telegram, Calendar, Notion)
    COMPOSIO_API_KEY: str = ""
    # R5 — entity Composio par owner via mapping d'env (résolu dans
    # tools/external_account_scope.py). En PRODUCTION l'entity DOIT venir de
    # COMPOSIO_ENTITY_BY_OWNER_JSON='{"<owner_uuid>":"<entity>"}' ; COMPOSIO_USER_ID
    # n'est plus qu'un fallback dev/test (gated par
    # ALLOW_LEGACY_EXTERNAL_ACCOUNT_FALLBACK_FOR_TESTS, jamais en prod).
    COMPOSIO_USER_ID: str = ""  # dev/test legacy entity fallback ONLY — vide par défaut, override via env
    COMPOSIO_CALLBACK_URL: str = ""  # e.g. https://myswarms.vercel.app/settings/integrations/callback

    # Telegram — chat par owner via TELEGRAM_CHAT_BY_OWNER_JSON (R5). TELEGRAM_CHAT_ID
    # n'est plus qu'un fallback dev/test gated ; en prod le chat est owner-scopé.
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""  # dev/test legacy chat fallback ONLY

    # Daily Chief of Staff — User preferences
    USER_TIMEZONE: str = "Asia/Dubai"
    USER_LANGUAGE: str = "fr"
    VIP_CONTACTS: list[str] = Field(
        default=[],
        description=(
            "JSON array of VIP email patterns. "
            "Example: '[\"boss@example.com\",\"client@\"]'. "
            "CSV NOT supported — must be a valid JSON array."
        ),
    )
    URGENT_KEYWORDS: list[str] = Field(
        default=[
            "urgent",
            "asap",
            "deadline",
            "aujourd'hui",
            "bloqué",
            "important",
            "payment",
            "invoice",
            "overdue",
            "meeting today",
        ],
        description=(
            "JSON array of urgent keywords (plain strings, not regex). "
            "Example: '[\"urgent\",\"asap\",\"today\"]'. "
            "CSV NOT supported — must be a valid JSON array."
        ),
    )

    # Security level (1-5). Default 2: drafts prepared, no auto-send.
    SECURITY_LEVEL: int = Field(default=2, ge=1, le=5)

    # ── Scheduler — owner attribution ────────────────────────────────────
    # owner_id attribué aux runs Chief planifiés (cron).
    # DOIT être surchargé via CHIEF_SCHEDULER_OWNER_ID en prod/staging.
    # Valeur par défaut vide — le scheduler lèvera une erreur explicite au
    # démarrage si la variable est absente (voir check boot ci-dessous).
    CHIEF_SCHEDULER_OWNER_ID: str = ""

    # ── APScheduler ─────────────────────────────────────────────────────
    SCHEDULER_ENABLED: bool = True
    MORNING_HOUR: int = Field(default=8, ge=0, le=23)
    MORNING_MINUTE: int = Field(default=0, ge=0, le=59)
    EVENING_HOUR: int = Field(default=18, ge=0, le=23)
    EVENING_MINUTE: int = Field(default=30, ge=0, le=59)

    # Flow execution timeout — if flow.kickoff() exceeds this, status → "failed".
    # gt=0 guard: asyncio.wait_for(timeout=0) would expire immediately on every kickoff.
    # Raised from 300 to 900: Kimi K2.6 swarms with 4 tasks take 360-480s;
    # the only successful production run completed in ~250s — 900 gives headroom.
    FLOW_TIMEOUT_SECONDS: int = Field(default=900, gt=0, description="Max seconds before flow.kickoff() times out")

    # Per-task timeout multiplier for adaptive timeout calculation.
    # Used with n_tasks to compute min(MAX_FLOW_TIMEOUT_SECONDS, max(FLOW_TIMEOUT_SECONDS, n_tasks * PER_TASK_TIMEOUT_SECONDS)).
    PER_TASK_TIMEOUT_SECONDS: int = Field(
        default=120,
        gt=0,
        description="Per-task timeout budget (seconds). Adaptive timeout = min(MAX, max(FLOW_TIMEOUT_SECONDS, n_tasks * this)).",
    )

    # Hard cap on the adaptive timeout — guarantees the invariant:
    #   STALE_RUN_MAX_AGE_MINUTES * 60 > MAX_FLOW_TIMEOUT_SECONDS
    # Default 1800s (30 min) < STALE_RUN_MAX_AGE_MINUTES default 45 min (2700s).
    # Without this cap, n_tasks ≥ 16 would produce a timeout > stale cutoff,
    # causing the cleanup job to kill a still-running valid run.
    MAX_FLOW_TIMEOUT_SECONDS: int = Field(
        default=1800,
        gt=0,
        description="Hard cap (seconds) on the adaptive flow timeout. Must satisfy MAX_FLOW_TIMEOUT_SECONDS < STALE_RUN_MAX_AGE_MINUTES * 60 to prevent cleanup from killing live runs.",
    )

    # Stale run cleanup — runs stuck in 'running' for longer than this are marked failed.
    # Invariant: STALE_RUN_MAX_AGE_MINUTES * 60 > MAX_FLOW_TIMEOUT_SECONDS (2700 > 1800 — 15 min margin).
    # Raised from 30 → 45 to guarantee the invariant with the default MAX_FLOW_TIMEOUT_SECONDS=1800.
    STALE_RUN_MAX_AGE_MINUTES: int = Field(
        default=45,
        gt=0,
        description="Runs in 'running' status older than this (minutes) are marked failed at boot and by the cleanup job. Must satisfy STALE_RUN_MAX_AGE_MINUTES * 60 > MAX_FLOW_TIMEOUT_SECONDS.",
    )

    # Interval between stale-run cleanup sweeps (APScheduler job).
    STALE_RUN_CLEANUP_INTERVAL_MINUTES: int = Field(
        default=10,
        gt=0,
        description="Interval in minutes between periodic stale-run cleanup sweeps.",
    )

    # Max lag (seconds) before APScheduler skips a misfired job entirely.
    MISFIRE_GRACE_TIME_SECONDS: int = Field(default=300, gt=0)  # max lag before skipping misfired job

    # Architect Agent — timeout (s) de génération de spec de swarm. La
    # génération inclut jusqu'à 3 appels LLM Opus (retry) — d'où une marge
    # plus large qu'un simple appel. gt=0 : 0 expirerait immédiatement.
    ARCHITECT_TIMEOUT_SECONDS: int = Field(
        default=180,
        gt=0,
        description="Max seconds before architect spec generation times out",
    )

    # ── Human-in-the-loop (HITL) ─────────────────────────────────────────
    # Borne de convergence : nb max de reprises HITL d'un run avant de le
    # marquer failed (anti-boucle running↔paused_hitl). gt=0.
    HITL_RESUME_MAX: int = Field(
        default=10,
        gt=0,
        description="Max HITL resumes per run before it is marked failed (anti-non-convergence).",
    )
    # TTL (minutes) d'une décision en attente. Un run paused_hitl plus vieux que
    # ce délai est marqué failed par expire_stale_paused_runs. gt=0.
    HITL_DECISION_TTL_MINUTES: int = Field(
        default=1440,  # 24 h
        gt=0,
        description="Minutes a paused_hitl run waits for a human answer before being expired.",
    )


settings = Settings()

# ── P2-1 : silence LiteLLM botocore pre-load noise at ERROR level.
# WHY: litellm imports botocore at startup and emits WARNING-level noise about
# missing AWS credentials even when AWS is never used. Setting ERROR silences
# those warnings without hiding real LiteLLM errors (which are ERROR+).
import warnings  # noqa: E402

logging.getLogger("LiteLLM").setLevel(logging.ERROR)

# ── P2-2 : suppress pydantic UserWarning about non-serializable callbacks.
# WHY: CrewAI passes function callbacks into pydantic models; pydantic emits
# "function callbacks cannot be serialized and will prevent checkpointing"
# on every crew creation. We silence this one specific message — NOT all
# UserWarnings — so that we don't accidentally swallow unrelated warnings.
warnings.filterwarnings(
    "ignore",
    message=r".*callbacks cannot be serialized.*",
    category=UserWarning,
)

# ── Boot-time misconfig warnings ─────────────────────────────────────────────
# Ne cassent PAS le boot — logging uniquement. Permet d'identifier les
# configurations partielles avant que les agents tombent en erreur à l'exécution.
#
# Politique Hypercli-only : HYPERCLI_API_KEY est désormais la seule clé LLM
# critique. ANTHROPIC_API_KEY et OPENAI_API_KEY sont optionnelles (abaissées
# en info) — aucun chemin de production ne devrait les appeler directement.
# COMPOSIO_API_KEY reste critique (tools Composio indépendants du provider LLM).
_CRITICAL_API_KEYS = {
    "HYPERCLI_API_KEY": settings.HYPERCLI_API_KEY,
    "COMPOSIO_API_KEY": settings.COMPOSIO_API_KEY,
}
for _key, _val in _CRITICAL_API_KEYS.items():
    if not _val:
        _boot_logger.warning(
            "Boot misconfiguration: %s is empty — agents using this provider will fail at runtime.",
            _key,
        )

# Clés optionnelles (plus utilisées en production — Hypercli-only) : simple info.
_OPTIONAL_API_KEYS = {
    "ANTHROPIC_API_KEY": settings.ANTHROPIC_API_KEY,
    "OPENAI_API_KEY": settings.OPENAI_API_KEY,
}
for _key, _val in _OPTIONAL_API_KEYS.items():
    if not _val:
        _boot_logger.info(
            "Boot info: %s is empty (optional — Hypercli-only policy, no LLM call expected on this provider).",
            _key,
        )

# Stale-run / adaptive-timeout invariant :
# STALE_RUN_MAX_AGE_MINUTES * 60 must be strictly greater than MAX_FLOW_TIMEOUT_SECONDS,
# otherwise the cleanup job can mark a still-running (and still within budget) run as failed.
if settings.STALE_RUN_MAX_AGE_MINUTES * 60 <= settings.MAX_FLOW_TIMEOUT_SECONDS:
    _boot_logger.warning(
        "Boot misconfiguration: STALE_RUN_MAX_AGE_MINUTES (%ds) <= MAX_FLOW_TIMEOUT_SECONDS (%ds)"
        " — le cleanup peut tuer des runs encore vivants ; augmente STALE_RUN_MAX_AGE_MINUTES.",
        settings.STALE_RUN_MAX_AGE_MINUTES * 60,
        settings.MAX_FLOW_TIMEOUT_SECONDS,
    )

# CHIEF_SCHEDULER_OWNER_ID vide → runs planifiés sans owner → pollution cross-tenant.
if settings.SCHEDULER_ENABLED and not settings.CHIEF_SCHEDULER_OWNER_ID:
    _boot_logger.warning(
        "Boot misconfiguration: CHIEF_SCHEDULER_OWNER_ID is empty — scheduled Chief runs will have "
        "no owner attribution. Set CHIEF_SCHEDULER_OWNER_ID to the UUID of the target auth.users row."
    )

# COMPOSIO_USER_ID vide en prod → tools Composio désactivés silencieusement.
if not settings.COMPOSIO_USER_ID and _IS_PROD_ENV:
    _boot_logger.warning(
        "Boot misconfiguration: COMPOSIO_USER_ID is empty in production — Composio tools will be "
        "disabled for any run without an explicit owner_id. Set COMPOSIO_USER_ID or provision "
        "COMPOSIO_ENTITY_BY_OWNER_JSON for multi-tenant isolation."
    )
