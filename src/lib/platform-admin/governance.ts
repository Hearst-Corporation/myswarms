/**
 * Platform Admin Console — governance action matrix.
 *
 * Détermine quelles actions opérateur sont SÛRES en V1. Règle dure : une
 * action n'est `enabled` que si elle peut être écrite de façon DURABLE et
 * AUDITÉE. Tant qu'aucune table de gouvernance (tenant_status / tenant_quotas
 * / operator_notes / audit immuable) n'existe, TOUT est `disabled` avec une
 * raison explicite. On ne simule jamais une mutation (pas de mock qui
 * ressemble à une vraie action).
 *
 * Cette matrice est calculée côté serveur et envoyée à l'UI : l'UI affiche
 * les boutons en disabled + la raison. Aucune route de mutation n'existe tant
 * que ces foundations ne sont pas posées (cf. PR future).
 */

import type { GovernanceActionKey, GovernanceActionState } from "./types";

/**
 * Foundations requises par action. Toutes absentes en V1 -> tout disabled.
 * On expose le détail pour que l'opérateur sache exactement quoi construire.
 */
const ACTION_DEFS: Array<{
  key: GovernanceActionKey;
  label: string;
  requires: string;
}> = [
  {
    key: "set_tenant_status",
    label: "Activer / suspendre le tenant",
    requires: "table durable de statut tenant + journal d'audit immuable",
  },
  {
    key: "set_run_quota",
    label: "Définir le quota de runs",
    requires: "table tenant_quotas (owner_id, runs_limit, period, used) + audit",
  },
  {
    key: "toggle_tool_permission",
    label: "Autoriser / refuser un outil",
    requires: "table de permissions par owner + audit (mappings actuels = env, read-only)",
  },
  {
    key: "add_operator_note",
    label: "Ajouter une note opérateur",
    requires: "table operator_notes (owner_id, author, text, created_at)",
  },
  {
    key: "mark_approved",
    label: "Marquer approuvé pour exécution",
    requires: "workflow d'approbation tenant durable + audit",
  },
];

/**
 * Détecte si une foundation de gouvernance durable existe. En V1 aucune n'est
 * présente (vérifié via la cartographie Supabase : pas de tenant_quotas,
 * pas d'operator_notes, pas d'audit_logs). On garde le hook pour activer
 * proprement quand les tables seront créées (sans inventer de persistance).
 */
export function governanceFoundationPresent(): boolean {
  // Drapeau explicite : passe à true UNIQUEMENT quand les tables durables +
  // l'audit immuable existent réellement et qu'une route de mutation auditée
  // est branchée. Ne jamais activer sur la seule présence d'un env.
  return process.env.PLATFORM_ADMIN_GOVERNANCE_ENABLED === "true";
}

/** Matrice d'actions pour l'UI. Tout disabled tant que la foundation manque. */
export function getGovernanceActions(): GovernanceActionState[] {
  const enabled = governanceFoundationPresent();
  return ACTION_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    enabled,
    disabledReason: enabled
      ? undefined
      : `Action désactivée — requiert ${def.requires}. Aucune mutation non durable/non auditée n'est exposée.`,
  }));
}
