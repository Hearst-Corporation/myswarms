import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnerId } from "@/lib/auth/owner";
import { ALL_MODULE_IDS, type ModuleId } from "@/lib/tenant/modules";

/**
 * Config d'interface par tenant (niveau 2 multi-tenant UI).
 *
 * Pilote la navigation (modules visibles) et l'accent produit. La source de
 * vérité est la table `tenant_config` (RLS owner-scoped). Absence de ligne →
 * tous les modules visibles (rétro-compatible). Fail-soft : retourne le défaut
 * en cas d'erreur ou de session absente — la nav ne casse jamais.
 */

export interface TenantConfig {
  modules: ModuleId[];
  product: string;
}

const DEFAULT_CONFIG: TenantConfig = { modules: ALL_MODULE_IDS, product: "hive" };

export async function getTenantConfig(): Promise<TenantConfig> {
  const ownerId = await getOwnerId().catch(() => null);
  if (!ownerId) return DEFAULT_CONFIG;

  try {
    // Lecture via service role, STRICTEMENT scopée par l'ownerId déjà authentifié
    // (getOwnerId = getUser cryptographique). Le filtre .eq("owner_id", ownerId)
    // garantit qu'on ne lit QUE la config de ce tenant — aucune fuite cross-tenant.
    // Service role nécessaire car appelé aussi en dev bypass (pas de session RLS).
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("tenant_config")
      .select("modules, product")
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (!data) return DEFAULT_CONFIG;

    const modules = (Array.isArray(data.modules) ? data.modules : []).filter(
      (m: unknown): m is ModuleId => ALL_MODULE_IDS.includes(m as ModuleId),
    );
    return {
      modules: modules.length ? modules : ALL_MODULE_IDS,
      product: typeof data.product === "string" && data.product ? data.product : "hive",
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
