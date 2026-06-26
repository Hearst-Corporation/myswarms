/**
 * Platform Admin Console — external mappings & tool permissions (presence-only).
 *
 * Server-only. Lit les mappings owner→externe depuis les env JSON
 * (COMPOSIO_ENTITY_BY_OWNER_JSON, TELEGRAM_CHAT_BY_OWNER_JSON,
 * VAULT_NAMESPACE_BY_OWNER_JSON, CHIEF_SCHEDULER_OWNER_ID) et n'expose
 * QUE la présence/absence — jamais l'entity, le chat_id, le namespace.
 *
 * Ces mappings sont la source de vérité runtime du moteur crewai-engine
 * (owner-scopé, fail-closed). Côté BFF on s'en sert uniquement pour
 * répondre "configuré / non configuré" dans la console.
 */

import type {
  MappingPresence,
  TenantMappings,
  TenantToolPermissions,
  ToolPermissionStatus,
} from "./types";

/** Parse un env JSON `{ "<ownerId>": <value> }` en set d'ownerIds présents. */
function ownerSetFromJsonEnv(envValue: string | undefined): Set<string> {
  if (!envValue) return new Set();
  try {
    const parsed = JSON.parse(envValue) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Set();
    return new Set(
      Object.entries(parsed as Record<string, unknown>)
        // un mapping vide/null compte comme absent
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k]) => k),
    );
  } catch {
    return new Set();
  }
}

/** Snapshot des mappings configurés, calculé une fois par agrégation. */
export interface MappingSnapshot {
  composioOwners: Set<string>;
  telegramOwners: Set<string>;
  vaultOwners: Set<string>;
  schedulerOwnerId: string | null;
  /** Outils globaux disponibles (clé Composio présente, etc.). */
  composioConfigured: boolean;
  telegramConfigured: boolean;
  vaultConfigured: boolean;
  cortexConfigured: boolean;
}

export function readMappingSnapshot(env: NodeJS.ProcessEnv = process.env): MappingSnapshot {
  const schedulerOwnerId = (env.CHIEF_SCHEDULER_OWNER_ID ?? "").trim() || null;
  return {
    composioOwners: ownerSetFromJsonEnv(env.COMPOSIO_ENTITY_BY_OWNER_JSON),
    telegramOwners: ownerSetFromJsonEnv(env.TELEGRAM_CHAT_BY_OWNER_JSON),
    vaultOwners: ownerSetFromJsonEnv(env.VAULT_NAMESPACE_BY_OWNER_JSON),
    schedulerOwnerId,
    composioConfigured: Boolean((env.COMPOSIO_API_KEY ?? "").trim()),
    telegramConfigured: Boolean((env.TELEGRAM_BOT_TOKEN ?? "").trim()),
    vaultConfigured: Boolean((env.VAULT_DEFAULT_NAMESPACE ?? "").trim()) ||
      ownerSetFromJsonEnv(env.VAULT_NAMESPACE_BY_OWNER_JSON).size > 0,
    cortexConfigured: Boolean((env.CORTEX_URL ?? "").trim() && (env.CORTEX_API_KEY ?? "").trim()),
  };
}

function presence(present: boolean): MappingPresence {
  return present ? "present" : "absent";
}

/** Mappings externes presence-only pour un owner donné. */
export function tenantMappingsFor(
  ownerId: string,
  snap: MappingSnapshot,
): TenantMappings {
  return {
    composioEntity: presence(snap.composioOwners.has(ownerId)),
    telegramChat: presence(snap.telegramOwners.has(ownerId)),
    vaultNamespace: presence(snap.vaultOwners.has(ownerId)),
    schedulerOwner: presence(snap.schedulerOwnerId === ownerId),
  };
}

/**
 * Statut des permissions d'outils pour un owner.
 *
 * Modèle dérivé (pas de table permissions durable en V1) :
 *  - composio/telegram/vault : enabled si l'owner a un mapping ; sinon
 *    fail_closed si l'outil global est configuré (le moteur refuse faute de
 *    mapping owner) ; sinon not_configured si l'outil global n'existe pas.
 *  - chief : enabled si l'owner est l'owner du scheduler, sinon disabled.
 *  - architect : enabled par défaut (capacité plateforme, pas de gate owner).
 */
export function tenantToolPermissionsFor(
  ownerId: string,
  snap: MappingSnapshot,
): TenantToolPermissions {
  const scoped = (
    hasMapping: boolean,
    globalConfigured: boolean,
  ): ToolPermissionStatus => {
    if (hasMapping) return "enabled";
    if (globalConfigured) return "fail_closed";
    return "not_configured";
  };

  return {
    composio: scoped(snap.composioOwners.has(ownerId), snap.composioConfigured),
    telegram: scoped(snap.telegramOwners.has(ownerId), snap.telegramConfigured),
    vault: scoped(snap.vaultOwners.has(ownerId), snap.vaultConfigured),
    chief: snap.schedulerOwnerId === ownerId ? "enabled" : "disabled",
    architect: "enabled",
  };
}
