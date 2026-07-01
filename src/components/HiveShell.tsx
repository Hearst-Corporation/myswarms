"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/cockpit/AppShell";

// Routes rendues hors du shell (plein écran, sans sidebar ni topbar).
const BARE_ROUTES = ["/login"];

/**
 * Enveloppe applicative MySwarms. Rend le shell neuf (AppShell) sauf sur les
 * routes « bare » (login) rendues en plein écran.
 */
export function HiveShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isBare = BARE_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );

  if (isBare) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
