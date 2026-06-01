"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useTenantConfig } from "@/components/cockpit/TenantConfigProvider";

/**
 * Switcher de dashboard / espace produit. Permet de passer de l'espace
 * **Automobile** (couleurs propres) à l'espace **Admin/Hive**.
 *
 * Pose `data-product` sur <html> selon l'espace actif → l'accent couleur change
 * (cf. overrides [data-product="automobile"] dans cockpit.css). Piloté par la
 * route : naviguer vers /automobile applique l'accent automobile, même sans
 * cliquer le switcher.
 */
const SPACES = [
  { id: "automobile", label: "Automobile", href: "/automobile", prefix: "/automobile", product: "automobile", superAdminOnly: false },
  { id: "admin", label: "Admin", href: "/admin/users", prefix: "/admin", product: "hive", superAdminOnly: true },
] as const;

export function DashboardSwitcher() {
  const pathname = usePathname() ?? "/";
  const { isSuperAdmin } = useTenantConfig();

  const active = SPACES.find((s) => pathname.startsWith(s.prefix)) ?? null;
  const product = active?.product ?? "hive";

  // Applique l'accent du space courant sur <html> (route-driven).
  useEffect(() => {
    document.documentElement.setAttribute("data-product", product);
  }, [product]);

  const visible = SPACES.filter((s) => !s.superAdminOnly || isSuperAdmin);

  return (
    <div className="ct-seg-track" role="group" aria-label="Changer de dashboard">
      {visible.map((s) => (
        <Link
          key={s.id}
          href={s.href}
          className={`ct-seg-btn ${active?.id === s.id ? "active" : ""}`}
          title={`Aller au dashboard ${s.label}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}
