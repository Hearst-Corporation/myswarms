/**
 * Platform Admin Console — data contract.
 *
 * Types partagés entre la couche d'accès données server-only
 * (`src/lib/platform-admin/*`), les routes API admin et l'UI Control Tower.
 *
 * RÈGLE : aucun de ces types ne porte de secret. owner_id est visible à
 * l'admin (server-derived) mais jamais modifiable depuis le client. Les
 * valeurs sensibles (tokens, chat_id, namespaces, prompts bruts) ne
 * transitent PAS — on n'expose que des statuts presence-only et des
 * previews rédactés.
 */

export type TenantStatus =
  | "active"
  | "pending"
  | "suspended"
  | "blocked"
  | "internal"
  | "unknown";

export type ToolPermissionStatus =
  | "enabled"
  | "disabled"
  | "not_configured"
  | "fail_closed";

/** Présence d'un mapping externe — jamais la valeur. */
export type MappingPresence = "present" | "absent";

export type QuotaPeriod = "daily" | "monthly" | "none";

export interface TenantQuota {
  /** null = pas de plafond configuré (foundation absente). */
  limit: number | null;
  used: number;
  /** null si limit null. */
  remaining: number | null;
  period: QuotaPeriod;
  /** true tant qu'aucune table de quotas durable n'existe. */
  notConfigured: boolean;
}

export interface TenantToolPermissions {
  composio: ToolPermissionStatus;
  telegram: ToolPermissionStatus;
  vault: ToolPermissionStatus;
  chief: ToolPermissionStatus;
  architect: ToolPermissionStatus;
}

export interface TenantMappings {
  composioEntity: MappingPresence;
  telegramChat: MappingPresence;
  vaultNamespace: MappingPresence;
  /** Cet owner est-il l'owner du scheduler Chief ? */
  schedulerOwner: MappingPresence;
}

/** Ligne de la table tenants/owners. */
export interface PlatformTenant {
  ownerId: string;
  /** Libellé safe : email masqué ou identifiant court. */
  label: string;
  /** Email masqué (jamais l'email brut complet). */
  emailMasked?: string;
  status: TenantStatus;
  /** Tenant(s) control-plane auxquels l'owner est rattaché. */
  tenantIds: string[];
  swarmsCount: number;
  runsCount: number;
  activeRunsCount: number;
  quota: TenantQuota;
  tools: TenantToolPermissions;
  mappings: TenantMappings;
  incidentsCount: number;
  lastActivityAt?: string;
  isInternal: boolean;
}

export interface PlatformRunSummary {
  /** UUID court rédacté (8 premiers chars). */
  runId: string;
  ownerId: string;
  /** "swarm" | "chief" — origine du run. */
  source: "swarm" | "chief";
  swarmLabel?: string;
  status: string;
  startedAt?: string;
  updatedAt?: string;
  durationMs?: number;
  stepsCount?: number;
  errorClass?: string;
  traceId?: string;
  /** Aperçu rédacté/tronqué. Absent par défaut si doute. */
  promptPreviewRedacted?: string;
}

export interface PlatformApproval {
  decisionId: string;
  ownerId: string;
  runId: string;
  source: "swarm" | "chief";
  status: "pending" | "resolved" | "expired";
  createdAt?: string;
  resolvedAt?: string;
}

export type IncidentSeverity = "info" | "warning" | "critical";

export interface PlatformIncident {
  /** Classe d'incident dérivée — pas de contenu sensible. */
  kind:
    | "missing_composio_mapping"
    | "missing_telegram_mapping"
    | "missing_vault_mapping"
    | "scheduler_not_configured"
    | "quota_not_configured"
    | "cortex_not_configured"
    | "run_failed"
    | "ownerless_run";
  severity: IncidentSeverity;
  ownerId?: string;
  message: string;
  at?: string;
}

export interface PlatformOverview {
  totalOwners: number;
  active: number;
  pending: number;
  suspended: number;
  blocked: number;
  internal: number;
  unconfiguredMappings: number;
  runsToday: number;
  runsWeek: number;
  activeRuns: number;
}

export interface SecurityGate {
  key: string;
  label: string;
  status: "enforced" | "degraded" | "unknown";
  detail: string;
}

export interface BackendStatus {
  engineConfigured: boolean;
  cortexConfigured: boolean;
  schedulerOwnerConfigured: boolean;
  /** ISO timestamp de la dernière agrégation. */
  syncedAt: string;
}

/** Détail complet d'un tenant pour le drawer/page detail. */
export interface PlatformTenantDetail extends PlatformTenant {
  runs: PlatformRunSummary[];
  approvals: PlatformApproval[];
  incidents: PlatformIncident[];
  swarms: Array<{
    id: string;
    label: string;
    isActive: boolean;
    isTemplate: boolean;
    createdAt?: string;
  }>;
  /** Notes opérateur — vide tant que la foundation audit n'existe pas. */
  operatorNotes: Array<{ at: string; text: string }>;
}

/** Matrice des actions de gouvernance : ce qui est faisable en V1. */
export type GovernanceActionKey =
  | "set_tenant_status"
  | "set_run_quota"
  | "toggle_tool_permission"
  | "add_operator_note"
  | "mark_approved";

export interface GovernanceActionState {
  key: GovernanceActionKey;
  label: string;
  enabled: boolean;
  /** Raison du disabled (foundation manquante). */
  disabledReason?: string;
}
