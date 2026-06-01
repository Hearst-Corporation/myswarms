"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { BottomBarSwarmActions } from "@/components/swarms/BottomBarSwarmActions";
import { LaunchButton } from "@/components/cockpit/LaunchButton";
import { BUILDER_TABS, type BuilderTabId, parseBuilderTab } from "@/lib/swarms/builderTabs";
import { useSwarmTemplate } from "@/lib/swarms/templateContext";
import { MODULES } from "@/lib/tenant/modules";
import { useTenantConfig } from "@/components/cockpit/TenantConfigProvider";

const SWARM_DETAIL_REGEX = /^\/swarms\/([0-9a-f-]{36})$/i;
const SWARM_EDIT_REGEX = /^\/swarms\/([0-9a-f-]{36})\/edit$/i;

export function AppBottomBar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const searchParams = useSearchParams();
  const tablistRef = useRef<HTMLDivElement>(null);
  const { isTemplate: swarmIsTemplate } = useSwarmTemplate();
  const { modules, isSuperAdmin } = useTenantConfig();
  const visibleModules = MODULES.filter((m) => modules.includes(m.id));

  const isHome = pathname === "/";
  const isSwarmsArea = pathname.startsWith("/swarms");
  const isAutomotiveArea = pathname.startsWith("/automobile") || pathname.startsWith("/automotive");
  const detailMatch = pathname.match(SWARM_DETAIL_REGEX);
  const isSwarmDetail = Boolean(detailMatch);
  const isSwarmEdit = SWARM_EDIT_REGEX.test(pathname);
  const isSwarmNew = pathname === "/swarms/new";
  const swarmIdFromDetail = detailMatch?.[1] ?? null;
  const isBuilderRoute = isSwarmNew || isSwarmEdit;

  const sectionLabel = isBuilderRoute
    ? isSwarmNew ? "Nouveau swarm" : "Édition swarm"
    : isHome ? "Cockpit"
    : isSwarmsArea ? "Swarms"
    : isAutomotiveArea ? "Automobile"
    : "Cockpit";

  const activeTab: BuilderTabId = parseBuilderTab(searchParams.get("tab"));

  const navigateToTab = (tabId: BuilderTabId) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("tab", tabId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleTablistKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (!tabs || tabs.length === 0) return;
    const tabsArray = Array.from(tabs);
    const currentIndex = BUILDER_TABS.findIndex((t) => t.id === activeTab);
    let nextIndex: number | null = null;
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); nextIndex = currentIndex <= 0 ? tabsArray.length - 1 : currentIndex - 1; break;
      case "ArrowRight": e.preventDefault(); nextIndex = currentIndex >= tabsArray.length - 1 ? 0 : currentIndex + 1; break;
      case "Home": e.preventDefault(); nextIndex = 0; break;
      case "End": e.preventDefault(); nextIndex = tabsArray.length - 1; break;
      default: return;
    }
    if (nextIndex !== null) { navigateToTab(BUILDER_TABS[nextIndex].id); tabsArray[nextIndex].focus(); }
  };

  return (
    <>
    <nav className="ct-bottom-bar" role="navigation" aria-label="Main navigation">
      <div className="ct-bottom-bar-inner">
        <span className="ct-bottom-label">{sectionLabel}</span>

        {/* Mode builder — onglets Agents/Tasks/Tools REMPLACENT la nav principale */}
        {isBuilderRoute ? (
          <>
            <div
              ref={tablistRef}
              className="ct-seg-track"
              role="tablist"
              aria-label="Swarm builder sections"
              onKeyDown={handleTablistKeyDown}
            >
              {BUILDER_TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  id={`swarm-tab-${t.id}`}
                  aria-selected={activeTab === t.id}
                  aria-controls={`swarm-panel-${t.id}`}
                  tabIndex={activeTab === t.id ? 0 : -1}
                  className={`ct-seg-btn${activeTab === t.id ? " active" : ""}`}
                  onClick={() => navigateToTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Contexte edit : View ↔ Edit */}
            <div className="ct-seg-track">
              {isSwarmEdit ? (
                <>
                  <span className="ct-seg-btn active" aria-current="page">Éditer</span>
                  <Link href={pathname.replace(/\/edit$/, "")} className="ct-seg-btn">Vue</Link>
                </>
              ) : (
                <span className="ct-seg-btn primary" aria-current="page">Créer</span>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Mode navigation normale — modules pilotés par le tenant */}
            <div className="ct-seg-track">
              {visibleModules.map((m) => {
                const active =
                  m.href === "/" ? isHome : pathname.startsWith(m.href);
                return (
                  <Link
                    key={m.id}
                    href={m.href}
                    className={`ct-seg-btn ${active ? "active" : ""}`}
                  >
                    {m.label}
                  </Link>
                );
              })}
              {/* Admin — visible uniquement pour le super-admin */}
              {isSuperAdmin && (
                <Link
                  href="/admin/users"
                  className={`ct-seg-btn ${pathname.startsWith("/admin") ? "active" : ""}`}
                >
                  Admin
                </Link>
              )}
            </div>

            {/* Actions contextuelles sur un swarm */}
            {isSwarmDetail && swarmIdFromDetail && (
              <div className="ct-seg-track">
                <BottomBarSwarmActions swarmId={swarmIdFromDetail} />
                {!swarmIsTemplate && (
                  <Link href={`${pathname}/edit`} className="ct-seg-btn">Éditer</Link>
                )}
              </div>
            )}
          </>
        )}

        {/* Engine status — toujours visible, discret */}
        <div className="ct-seg-track">
          <LaunchButton />
        </div>
      </div>
    </nav>
    {/* Scroll fade scrim — sits above scrollable content, below bottom bar.
        Real DOM element so it works regardless of parent overflow:hidden.
        pointer-events:none keeps all nav and chat clicks passthrough. */}
    <div className="ct-bottom-bar-scrim" aria-hidden="true" />
    </>
  );
}
