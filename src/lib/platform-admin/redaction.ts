/**
 * Platform Admin Console — redaction helpers.
 *
 * Server-only. Garantit qu'aucun secret ni contenu privé brut ne sort vers
 * l'UI admin. Tout ce qui est sérialisé dans les props de page ou les
 * payloads API passe par ces helpers.
 *
 * Couvre : JWT (eyJ…), Bearer, clés sk-/service_role/Composio/Telegram,
 * IDs UUID raccourcis, previews de prompt tronqués, messages d'erreur
 * réduits à une classe.
 */

const PROMPT_PREVIEW_MAX = 120;

/** Patterns de secrets à neutraliser dans toute chaîne libre. */
const SECRET_PATTERNS: Array<{ re: RegExp; replace: string }> = [
  // JWT (header.payload.signature en base64url) — Supabase access/refresh tokens.
  { re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, replace: "[REDACTED_JWT]" },
  // JWT header seul (eyJ…) même tronqué.
  { re: /eyJ[A-Za-z0-9_-]{10,}/g, replace: "[REDACTED_JWT]" },
  // Authorization: Bearer <token>
  { re: /Bearer\s+[A-Za-z0-9._\-]+/gi, replace: "Bearer [REDACTED]" },
  // OpenAI / Anthropic / generic sk- keys (sk-, sk-ant-, sk-proj-…).
  { re: /sk-[A-Za-z0-9_-]{10,}/g, replace: "[REDACTED_KEY]" },
  // Supabase service_role / role JWT references.
  { re: /service_role/gi, replace: "[REDACTED_ROLE]" },
  // Composio API key prefix.
  { re: /ak_[A-Za-z0-9]{10,}/g, replace: "[REDACTED_KEY]" },
  // Telegram bot token (digits:base64ish).
  { re: /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, replace: "[REDACTED_TOKEN]" },
  // Hypercli key prefix.
  { re: /hyper_api_[A-Za-z0-9]{10,}/g, replace: "[REDACTED_KEY]" },
  // Provider key prefixes sans tiret/format propre (GitHub, Vercel, Cloudflare,
  // Resend, Axiom, Inngest, ElevenLabs, fal, Composio, Cloudflare tunnel/account).
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replace: "[REDACTED_KEY]" },
  { re: /\bvc[ip]_[A-Za-z0-9]{20,}/g, replace: "[REDACTED_KEY]" },
  { re: /\bcf(at|ut)_[A-Za-z0-9]{20,}/g, replace: "[REDACTED_KEY]" },
  { re: /\bre_[A-Za-z0-9_]{20,}/g, replace: "[REDACTED_KEY]" },
  { re: /\bxaat-[A-Za-z0-9-]{20,}/g, replace: "[REDACTED_KEY]" },
  { re: /\bsignkey-[A-Za-z0-9-]{20,}/g, replace: "[REDACTED_KEY]" },
  // ElevenLabs sk_ (underscore — distinct du sk- générique).
  { re: /\bsk_[A-Za-z0-9]{24,}/g, replace: "[REDACTED_KEY]" },
  // Secret en query-string d'URL (?api_key=… / ?token=… / ?access_token=…).
  {
    re: /([?&](?:api[_-]?key|token|secret|password|access_token|auth)=)[^&\s"']+/gi,
    replace: "$1[REDACTED]",
  },
];

/**
 * Neutralise tout secret connu dans une chaîne arbitraire.
 * Toujours appeler avant de sérialiser un texte d'origine moteur/log.
 */
export function redactSecret(value: string | null | undefined): string {
  if (!value) return "";
  let out = String(value);
  for (const { re, replace } of SECRET_PATTERNS) {
    out = out.replace(re, replace);
  }
  return out;
}

/**
 * Vrai si la chaîne contient (encore) un secret reconnaissable.
 * N'utilise PAS les regex globales partagées (lastIndex partagé entre appels) :
 * teste via le résultat de redactSecret pour rester déterministe.
 */
export function containsSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  return redactSecret(value) !== String(value);
}

/** Raccourcit un UUID/owner_id à 8 chars + ellipsis. owner_id reste visible à l'admin mais court. */
export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  const clean = String(id).trim();
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 8)}…`;
}

/** Masque un email : garde 1er char + domaine, masque le reste. */
export function maskEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.slice(0, 1);
  return `${head}${"•".repeat(Math.max(2, local.length - 1))}@${domain}`;
}

/**
 * Aperçu de prompt rédacté et tronqué. Retourne undefined si `allow` est faux
 * (politique par défaut : pas de preview en cas de doute) ou si le texte vide.
 */
export function redactPromptPreview(
  text: string | null | undefined,
  allow: boolean,
): string | undefined {
  if (!allow) return undefined;
  if (!text) return undefined;
  const cleaned = redactSecret(String(text)).replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  if (cleaned.length <= PROMPT_PREVIEW_MAX) return cleaned;
  return `${cleaned.slice(0, PROMPT_PREVIEW_MAX)}…`;
}

/**
 * Réduit une erreur à une classe courte et safe (pas de stack, pas de secret).
 * Ex. "TimeoutError: connect ETIMEDOUT 1.2.3.4:8000 Bearer eyJ…" -> "TimeoutError".
 */
export function redactError(error: string | null | undefined): string | undefined {
  if (!error) return undefined;
  const safe = redactSecret(String(error)).trim();
  if (!safe) return undefined;
  // Première ligne, première phrase / classe avant ':'.
  const firstLine = safe.split("\n")[0] ?? safe;
  const m = firstLine.match(/^[A-Za-z][A-Za-z0-9_]*Error/);
  if (m) return m[0];
  // Sinon, tronque la première ligne.
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

/** owner_id raccourci pour affichage — alias sémantique de shortId. */
export function redactOwnerId(ownerId: string | null | undefined): string {
  return shortId(ownerId);
}

/** trace_id raccourci si présent. */
export function shortTraceId(traceId: string | null | undefined): string | undefined {
  if (!traceId) return undefined;
  return shortId(traceId);
}
