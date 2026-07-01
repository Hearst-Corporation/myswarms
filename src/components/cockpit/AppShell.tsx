"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, useSyncExternalStore, type ComponentType, type ReactNode, type SVGProps } from "react";
import {
  HomeIcon,
  Squares2X2Icon,
  RectangleGroupIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  TruckIcon,
  BoltIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { MODULES } from "@/lib/tenant/modules";
import { useTenantConfig } from "@/components/cockpit/TenantConfigProvider";
import { LaunchButton } from "@/components/cockpit/LaunchButton";
import { ChatPanel } from "@/components/cockpit/ChatPanel";
import { cn } from "@/lib/ui/cn";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

// Map href → icône (présentation pure). Les hrefs/ids restent pilotés par la
// logique tenant/super-admin ci-dessous — on ne fait qu'associer une icône.
const ICON_BY_HREF: Record<string, Icon> = {
  "/": HomeIcon,
  "/workspace": Squares2X2Icon,
  "/swarms": RectangleGroupIcon,
  "/crews/chief-of-staff": UserGroupIcon,
  "/tools": WrenchScrewdriverIcon,
  "/automobile": TruckIcon,
  "/activity": BoltIcon,
  "/admin/users": ShieldCheckIcon,
  "/settings": Cog6ToothIcon,
};

// Nav complète super-admin (reprend MASTER_MODULES de l'ex-AppBottomBar).
const MASTER_MODULES = [
  { id: "accueil", label: "Accueil", href: "/" },
  { id: "workspace", label: "Workspace", href: "/workspace" },
  { id: "swarms", label: "Swarms", href: "/swarms" },
  { id: "crews", label: "Crews", href: "/crews/chief-of-staff" },
  { id: "tools", label: "Tools", href: "/tools" },
  { id: "automobile", label: "Automobile", href: "/automobile" },
  { id: "activity", label: "Activité", href: "/activity" },
  { id: "admin", label: "Admin", href: "/admin/users" },
];

const AUTOMOBILE_MODULES = [
  { id: "dashboard", label: "Dashboard", href: "/automobile" },
  { id: "nouvelle", label: "Nouvelle analyse", href: "/automobile/nouvelle" },
  { id: "historique", label: "Historique", href: "/automobile/historique" },
  { id: "marche", label: "Marché", href: "/automobile/marche" },
  { id: "sourcing", label: "Sourcing", href: "/automobile/sourcing" },
];

type NavItem = { id: string; label: string; href: string };

// Store réactif « écran ≥ lg » — via useSyncExternalStore pour un rendu SSR
// cohérent (serveur = false) sans warning d'hydratation ni setState-in-effect.
const DESKTOP_QUERY = "(min-width: 1024px)";
function subscribeDesktop(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
function getDesktopSnapshot(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches;
}
function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false);
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = ICON_BY_HREF[item.href] ?? Squares2X2Icon;
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent/12 text-content-strong ring-1 ring-inset ring-accent/25"
          : "text-content-muted hover:bg-surface-2 hover:text-content",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-5 shrink-0", active ? "text-accent" : "text-content-faint group-hover:text-content-muted")}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SidebarContent() {
  const pathname = usePathname() ?? "/";
  const { modules, isSuperAdmin } = useTenantConfig();

  const isAutomotiveArea = pathname.startsWith("/automobile");

  // Logique de nav préservée depuis l'ex-AppBottomBar :
  // - espace Automobile → modules automobile (+ retour Master si super-admin)
  // - super-admin hors auto → tous les modules
  // - utilisateur normal → modules autorisés par le tenant
  let items: NavItem[];
  if (isAutomotiveArea) {
    items = AUTOMOBILE_MODULES;
  } else if (isSuperAdmin) {
    items = MASTER_MODULES;
  } else {
    items = MODULES.filter((m) => modules.includes(m.id)).map((m) => ({ ...m }));
  }

  return (
    <div className="flex h-full flex-col gap-y-6 overflow-y-auto bg-surface px-4 py-5">
      <Link href="/" className="flex items-center gap-2.5 px-2">
        <span className="flex size-8 items-center justify-center rounded-[var(--radius-md)] bg-accent text-sm font-bold text-white">
          M
        </span>
        <span className="text-sm font-semibold tracking-tight text-content-strong">
          MySwarms
        </span>
      </Link>

      {isAutomotiveArea && isSuperAdmin ? (
        <Link
          href="/"
          className="flex items-center gap-2 px-2 text-xs font-medium text-content-faint hover:text-content-muted"
        >
          ← Master
        </Link>
      ) : null}

      <nav className="flex flex-1 flex-col" aria-label="Navigation principale">
        <ul role="list" className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <NavLink item={item} pathname={pathname} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-line pt-4">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors",
            isActive(pathname, "/settings")
              ? "bg-accent/12 text-content-strong ring-1 ring-inset ring-accent/25"
              : "text-content-muted hover:bg-surface-2 hover:text-content",
          )}
        >
          <Cog6ToothIcon className="size-5 shrink-0 text-content-faint" aria-hidden="true" />
          Réglages
        </Link>
      </div>
    </div>
  );
}

/**
 * Shell applicatif MySwarms — sidebar fixe (desktop) + drawer (mobile) + topbar.
 * Remplace l'ancien CockpitShell vendoré. Consomme la logique de nav réelle
 * (tenant modules / super-admin / espace automobile).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useIsDesktop();
  // Chat rail droit : override utilisateur (null = pas de choix → défaut = desktop).
  const [chatOverride, setChatOverride] = useState<boolean | null>(null);
  const chatOpen = chatOverride ?? isDesktop;
  const toggleChat = () => setChatOverride(!chatOpen);
  const closeChat = () => setChatOverride(false);

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line lg:block">
        <SidebarContent />
      </aside>

      {/* Drawer mobile */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-64 border-r border-line-strong">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
              className="absolute right-3 top-3 rounded-md p-1 text-content-muted hover:bg-surface-2 hover:text-content"
            >
              <XMarkIcon className="size-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      ) : null}

      {/* Chat rail droit (desktop) — fixe, largeur 380px, togglable */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-40 hidden w-[380px] border-l border-line transition-transform duration-200 lg:block",
          chatOpen ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!chatOpen}
      >
        <ChatPanel />
      </aside>

      {/* Chat drawer mobile */}
      {chatOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeChat}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm border-l border-line-strong">
            <button
              type="button"
              onClick={closeChat}
              aria-label="Fermer le chat"
              className="absolute left-3 top-4 z-10 rounded-md p-1 text-content-muted hover:bg-surface-2 hover:text-content"
            >
              <XMarkIcon className="size-5" />
            </button>
            <ChatPanel />
          </div>
        </div>
      ) : null}

      {/* Zone principale — se rétrécit quand le chat est ouvert (desktop) */}
      <div className={cn("lg:pl-64", chatOpen && "lg:pr-[380px]")}>
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/80 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            className="rounded-md p-1.5 text-content-muted hover:bg-surface-2 hover:text-content lg:hidden"
          >
            <Bars3Icon className="size-5" />
          </button>
          <div className="ml-auto flex items-center gap-3">
            <Suspense fallback={null}>
              <LaunchButton />
            </Suspense>
            <button
              type="button"
              onClick={toggleChat}
              aria-label={chatOpen ? "Masquer le chat" : "Afficher le chat"}
              aria-pressed={chatOpen}
              title="Chat Kimi"
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-[var(--radius-md)] ring-1 ring-inset ring-line transition-colors",
                chatOpen
                  ? "bg-accent/12 text-accent-strong ring-accent/25"
                  : "bg-surface-3 text-content-muted hover:bg-elevated hover:text-content",
              )}
            >
              <ChatBubbleLeftRightIcon className="size-5" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
