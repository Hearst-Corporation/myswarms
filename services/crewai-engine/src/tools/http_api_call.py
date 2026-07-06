"""HTTP API call tool — exécuteur générique d'un endpoint REST de la Strategy
Platform, construit dynamiquement depuis une row `tools` (table catalog).

Objet : donner à un agent CrewAI un tool GET « data-source » (ex. prix marché,
indicateurs) décrit UNIQUEMENT par sa row DB — sans code Python dédié par
endpoint. La factory `build_http_tool_from_row(tool_row)` lit
`name`/`description`/`endpoint_url`/`auth_type`/`schema_json` et retourne un
`BaseTool` prêt à binder à un agent.

Contrat de la row (cf. migration 0006 `tools`, seed 0023) :
    {
      "name":         "Market Prices",
      "description":  "Prix spot des marchés suivis",
      "endpoint_url": "/api/market/prices",        # relatif à STRATEGY_PLATFORM_URL
      "auth_type":    "bearer" | null,             # bearer → header Authorization
      "schema_json":  {"params": {                 # filtre/validation des kwargs
          "symbol": {"type": "string", "required": true},
          "window": {"type": "string", "default": "1d",
                     "enum": ["1h","1d","7d"]},
      }},
    }

Fail-soft TOTAL (comme vault_search) : timeout, 5xx, JSON invalide, base URL
absente → chaîne explicative `"[tool] unavailable: …"`. AUCUNE exception ne
remonte à l'agent (sinon CrewAI la retrie 3× puis « Moving on then »).

Module FEUILLE : n'importe QUE `..config`. Aucun import de `crew_helpers`
(évite un cycle — crew_helpers pourra importer cette factory, pas l'inverse).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx
from crewai.tools import BaseTool
from pydantic import Field

from ..config import settings

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT_S: float = 10.0
_UNAVAILABLE_SUFFIX = "unavailable"
# Bornage du rendu markdown d'une réponse JSON volumineuse : évite de gonfler le
# prompt de l'agent avec un payload pathologique (cohérent avec vault_search).
_MAX_RENDER_CHARS = 6000
# Slug par défaut si le nom de la row est vide/illisible (BaseTool exige un name).
_FALLBACK_SLUG = "http_api_call"


def _slugify(name: str) -> str:
    """Nom de row → slug d'outil sûr pour un tool name CrewAI/LLM.

    'AutoScout24 Sourcing' → 'autoscout24_sourcing'. Minuscule, espaces/ponctuation
    → underscore, compression des underscores, jamais vide.
    """
    slug = re.sub(r"[^a-z0-9]+", "_", (name or "").strip().lower()).strip("_")
    return slug or _FALLBACK_SLUG


def _unavailable(slug: str, reason: str) -> str:
    """Message fail-soft standard, préfixé par le slug du tool (grep-able)."""
    return f"[{slug}] {_UNAVAILABLE_SUFFIX}: {reason}"


def _params_spec(schema_json: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    """Extrait `schema_json['params']` de façon défensive (toujours un dict)."""
    if not isinstance(schema_json, dict):
        return {}
    params = schema_json.get("params")
    if not isinstance(params, dict):
        return {}
    # Ne garder que les specs bien formées (valeur = dict).
    return {k: v for k, v in params.items() if isinstance(v, dict)}


def _describe_params(params: dict[str, dict[str, Any]]) -> str:
    """Rend un bloc lisible des params attendus, appended à la description LLM."""
    if not params:
        return ""
    lines: list[str] = ["", "Paramètres :"]
    for pname, spec in params.items():
        ptype = spec.get("type", "any")
        required = " (requis)" if spec.get("required") else ""
        enum = spec.get("enum")
        enum_str = f" ∈ {enum}" if isinstance(enum, list) and enum else ""
        default = spec.get("default")
        default_str = f" [défaut: {default}]" if default is not None else ""
        lines.append(f"- {pname}: {ptype}{required}{enum_str}{default_str}")
    return "\n".join(lines)


def _coerce_query_params(
    kwargs: dict[str, Any],
    params: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], str | None]:
    """Valide/filtre les kwargs contre la spec `params`, SANS crasher.

    Règles (best-effort, fail-soft) :
    - Un kwarg non déclaré dans la spec est ignoré (jamais forwarding aveugle).
      Si aucune spec n'est fournie, on laisse passer les kwargs non vides tels
      quels (endpoint sans contrat déclaré).
    - `default` appliqué quand la clé est absente/None.
    - `enum` : une valeur hors enum est rejetée → message d'erreur (pas d'appel).
    - `required` manquant (après défauts) → message d'erreur (pas d'appel).
    - Les None sont retirés (pas de `?x=None` dans l'URL).

    Retourne (query_params, error). error non-None ⇒ NE PAS émettre la requête.
    """
    # Endpoint sans contrat : forward des kwargs non vides, filtrés des None.
    if not params:
        clean = {k: v for k, v in kwargs.items() if v is not None and k != "kwargs"}
        return clean, None

    query: dict[str, Any] = {}
    missing_required: list[str] = []

    for pname, spec in params.items():
        value = kwargs.get(pname)
        if value is None and spec.get("default") is not None:
            value = spec.get("default")

        if value is None:
            if spec.get("required"):
                missing_required.append(pname)
            continue

        enum = spec.get("enum")
        if isinstance(enum, list) and enum and value not in enum:
            return {}, f"param '{pname}'={value!r} not in allowed {enum}"

        query[pname] = value

    if missing_required:
        return {}, f"missing required param(s): {', '.join(missing_required)}"

    return query, None


def _format_response(slug: str, data: Any) -> str:
    """Réponse JSON → markdown lisible LLM, borné en taille."""
    if isinstance(data, (dict, list)):
        try:
            pretty = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            pretty = str(data)
    else:
        pretty = str(data)

    if len(pretty) > _MAX_RENDER_CHARS:
        pretty = pretty[:_MAX_RENDER_CHARS] + "\n… (tronqué)"

    return f"**Réponse `{slug}` :**\n\n```json\n{pretty}\n```"


class HttpApiCallTool(BaseTool):
    """Tool GET générique construit depuis une row `tools` (fail-soft total).

    name/description sont injectés par la factory (`build_http_tool_from_row`)
    à partir de la row DB. Les colonnes de routage (endpoint/auth/params) sont
    portées par des attributs pydantic dédiés pour rester sérialisables.
    """

    name: str = _FALLBACK_SLUG
    description: str = "Appel HTTP générique vers un endpoint de la Strategy Platform."
    # Colonnes de la row `tools` nécessaires à l'exécution.
    endpoint_url: str = ""
    auth_type: str | None = None
    params_spec: dict[str, Any] = Field(default_factory=dict)

    def _run(self, **kwargs: Any) -> str:
        """GET l'endpoint avec les params validés. Ne lève JAMAIS ; renvoie une
        chaîne (résultat markdown ou message `[slug] unavailable: …`)."""
        slug = self.name or _FALLBACK_SLUG

        # (a) base URL — tolère absente/vide (fail-soft, message clair).
        base = (getattr(settings, "STRATEGY_PLATFORM_URL", "") or "").rstrip("/")
        if not base:
            return _unavailable(slug, "STRATEGY_PLATFORM_URL not configured")

        endpoint = (self.endpoint_url or "").strip()
        if not endpoint:
            return _unavailable(slug, "no endpoint_url configured for this tool")

        # (b) URL = base + endpoint relatif. Si la row porte déjà une URL absolue,
        # on la respecte (robustesse) ; sinon on préfixe la base.
        if endpoint.startswith(("http://", "https://")):
            url = endpoint
        else:
            url = base + ("" if endpoint.startswith("/") else "/") + endpoint

        # (c) validation/filtre des kwargs contre la spec — sans crasher.
        # `self.params_spec` est DÉJÀ le mapping {param: spec} (déballé par la
        # factory) ; on filtre juste les specs bien formées (valeur = dict).
        raw_spec = self.params_spec if isinstance(self.params_spec, dict) else {}
        params_spec = {k: v for k, v in raw_spec.items() if isinstance(v, dict)}
        query, err = _coerce_query_params(kwargs, params_spec)
        if err is not None:
            return _unavailable(slug, err)

        # (d) bearer optionnel — JAMAIS loggé.
        headers = {"Accept": "application/json"}
        if (self.auth_type or "").strip().lower() == "bearer":
            token = getattr(settings, "STRATEGY_PLATFORM_TOKEN", "") or ""
            if token:
                headers["Authorization"] = f"Bearer {token}"

        # (e) GET httpx timeout ~10s. (f) fail-soft total sur toute erreur.
        try:
            resp = httpx.get(url, params=query, headers=headers, timeout=_HTTP_TIMEOUT_S)
        except httpx.TimeoutException:
            logger.warning("[%s] GET timeout (%ss) url=%s", slug, _HTTP_TIMEOUT_S, url)
            return _unavailable(slug, f"timeout after {_HTTP_TIMEOUT_S:g}s")
        except httpx.HTTPError as exc:
            logger.warning("[%s] GET request failed: %s", slug, type(exc).__name__)
            return _unavailable(slug, f"connection error ({type(exc).__name__})")

        status = resp.status_code
        if status >= 500:
            logger.warning("[%s] upstream 5xx (%s) url=%s", slug, status, url)
            return _unavailable(slug, f"upstream {status}")
        if status == 401 or status == 403:
            return _unavailable(slug, f"unauthorized (HTTP {status})")
        if status >= 400:
            return _unavailable(slug, f"HTTP {status}")

        try:
            data = resp.json()
        except (ValueError, json.JSONDecodeError) as exc:
            logger.warning("[%s] invalid JSON response: %s", slug, exc)
            return _unavailable(slug, "invalid JSON response")

        # (g) formatage markdown lisible LLM.
        return _format_response(slug, data)


def build_http_tool_from_row(tool_row: dict[str, Any]) -> BaseTool:
    """Factory : row `tools` (dict) → instance `HttpApiCallTool` prête à binder.

    Dérive :
    - name  = slug(tool_row['name'])
    - description = tool_row['description'] + bloc params lisible (depuis schema_json)
    - endpoint_url / auth_type = colonnes de la row
    - params_spec = schema_json['params'] (filtré défensivement)

    Tolère une row partielle (clés absentes) sans lever : les défauts fail-soft
    du tool prennent le relais à l'exécution (message `[slug] unavailable: …`).
    """
    row = tool_row if isinstance(tool_row, dict) else {}

    slug = _slugify(str(row.get("name") or ""))
    params = _params_spec(row.get("schema_json") if isinstance(row.get("schema_json"), dict) else {})

    base_desc = (row.get("description") or "").strip() or (
        f"Appel HTTP GET vers l'endpoint `{row.get('endpoint_url') or '?'}` "
        "de la Strategy Platform."
    )
    description = base_desc + _describe_params(params)

    return HttpApiCallTool(
        name=slug,
        description=description,
        endpoint_url=(row.get("endpoint_url") or "").strip(),
        auth_type=row.get("auth_type"),
        params_spec=params,
    )
