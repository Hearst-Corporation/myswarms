"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTenantConfig } from "@/components/cockpit/TenantConfigProvider";

/**
 * Switcher de dashboard / espace produit. Pose `data-product` sur <html> selon
 * l'espace actif → l'accent couleur change (cf. overrides [data-product="…"]
 * dans cockpit.css).
 *
 * Accent de base = produit du **tenant actif** (niveau 1, registre `tenants`).
 * La sous-section /automobile force son propre accent au sein du front natif,
 * même sans cliquer le switcher.
 */
export function DashboardSwitcher() {
  const pathname = usePathname() ?? "/";
  const { product: tenantProduct } = useTenantConfig();

  const product = pathname.startsWith("/automobile") ? "automobile" : tenantProduct;

  useEffect(() => {
    document.documentElement.setAttribute("data-product", product);
  }, [product]);

  return null;
}
