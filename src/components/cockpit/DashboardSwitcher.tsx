"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Switcher de dashboard / espace produit. Permet de passer de l'espace
 * **Automobile** (couleurs propres) à l'espace **Admin/Hive**.
 *
 * Pose `data-product` sur <html> selon l'espace actif → l'accent couleur change
 * (cf. overrides [data-product="automobile"] dans cockpit.css). Piloté par la
 * route : naviguer vers /automobile applique l'accent automobile, même sans
 * cliquer le switcher.
 */
export function DashboardSwitcher() {
  const pathname = usePathname() ?? "/";

  const product = pathname.startsWith("/automobile") ? "automobile" : "hive";

  useEffect(() => {
    document.documentElement.setAttribute("data-product", product);
  }, [product]);

  return null;
}
