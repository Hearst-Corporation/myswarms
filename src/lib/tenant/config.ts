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
  /** Tenant actif (niveau 1, registre `tenants`). null = aucune appartenance résolue. */
  tenant: string | null;
}

const DEFAULT_CONFIG: TenantConfig = {
  modules: ALL_MODULE_IDS,
  product: "hive",
  tenant: null,
};

/** Ne garde que les modules connus du catalogue (client-safe). */
function sanitizeModules(value: unknown, fallback: ModuleId[]): ModuleId[] {
  const list = (Array.isArray(value) ? value : []).filter(
    (m: unknown): m is ModuleId => ALL_MODULE_IDS.includes(m as ModuleId),
  );
  return list.length ? list : fallback;
}

export async function getTenantConfig(): Promise<TenantConfig> {
  const ownerId = await getOwnerId().catch(() => null);
  if (!ownerId) return DEFAULT_CONFIG;

  try {
    // Lecture via service role, STRICTEMENT scopée par l'ownerId déjà authentifié
    // (getOwnerId = getUser cryptographique). Tous les filtres .eq("owner_id", …)
    // garantissent qu'on ne lit QUE les données de ce tenant — aucune fuite
    // cross-tenant. Service role nécessaire car appelé aussi en dev bypass.
    const supabase = createAdminClient();

    // --- Niveau 1 : tenant actif (registre `tenants` via membership). ---
    // is_default prioritaire, sinon premier rattachement.
    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id")
      .eq("owner_id", ownerId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    let base = DEFAULT_CONFIG;
    const tenantId: string | null = membership?.tenant_id ?? null;
    if (tenantId) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("product, modules")
        .eq("id", tenantId)
        .maybeSingle();
      if (tenant) {
        base = {
          modules: sanitizeModules(tenant.modules, ALL_MODULE_IDS),
          product:
            typeof tenant.product === "string" && tenant.product ? tenant.product : "hive",
          tenant: tenantId,
        };
      }
    }

    // --- Niveau 2 : override par-user (tenant_config), prioritaire sur le tenant. ---
    const { data } = await supabase
      .from("tenant_config")
      .select("modules, product")
      .eq("owner_id", ownerId)
      .maybeSingle();

    if (!data) return base;

    return {
      modules: sanitizeModules(data.modules, base.modules),
      product:
        typeof data.product === "string" && data.product ? data.product : base.product,
      tenant: tenantId,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}
