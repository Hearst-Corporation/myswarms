"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ALL_MODULE_IDS, type ModuleId } from "@/lib/tenant/modules";

/**
 * Contexte client portant la config d'interface du tenant courant, peuplée
 * côté serveur (layout) puis consommée par la nav (AppBottomBar). Défaut =
 * tous les modules (rétro-compatible si le provider n'enveloppe pas l'arbre).
 */
interface TenantConfigValue {
  modules: ModuleId[];
  product: string;
  /** Tenant actif (niveau 1). null = aucune appartenance résolue. */
  tenant: string | null;
  isSuperAdmin: boolean;
}

const TenantConfigContext = createContext<TenantConfigValue>({
  modules: ALL_MODULE_IDS,
  product: "hive",
  tenant: null,
  isSuperAdmin: false,
});

export function TenantConfigProvider({
  value,
  children,
}: {
  value: TenantConfigValue;
  children: ReactNode;
}) {
  return (
    <TenantConfigContext.Provider value={value}>{children}</TenantConfigContext.Provider>
  );
}

export function useTenantConfig(): TenantConfigValue {
  return useContext(TenantConfigContext);
}
