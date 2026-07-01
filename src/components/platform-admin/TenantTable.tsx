"use client";

/**
 * Platform Admin — table des tenants/owners. Dense, monospace pour les IDs,
 * cliquable pour ouvrir le détail. Aucun secret ; owner_id raccourci.
 */

import { Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import type { PlatformTenant } from "@/lib/platform-admin/types";
import { TenantStatusChip } from "./chips";

export function TenantTable({
  tenants,
  selectedOwnerId,
  onSelect,
}: {
  tenants: PlatformTenant[];
  selectedOwnerId: string | null;
  onSelect: (ownerId: string) => void;
}) {
  if (!tenants.length) {
    return (
      <div className="px-6 py-12 text-center text-sm text-content-faint">
        Aucun owner connu. La plateforme n&apos;a pas encore d&apos;identité enregistrée côté auth.
      </div>
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Owner</TH>
          <TH>Status</TH>
          <TH>Swarms</TH>
          <TH>Runs</TH>
          <TH>Actifs</TH>
          <TH>Quota</TH>
          <TH>Outils</TH>
          <TH>Incidents</TH>
          <TH>Dernière activité</TH>
        </TR>
      </THead>
      <TBody>
        {tenants.map((t) => {
          const selected = t.ownerId === selectedOwnerId;
          const toolsOn = Object.values(t.tools).filter((s) => s === "enabled").length;
          const toolsFail = Object.values(t.tools).filter((s) => s === "fail_closed").length;
          return (
            <TR
              key={t.ownerId}
              onClick={() => onSelect(t.ownerId)}
              className={cn("cursor-pointer", selected && "bg-accent/10 hover:bg-accent/10")}
            >
              <TD>
                <div className="flex flex-col">
                  <span className="font-medium text-content-strong">{t.label}</span>
                  <span className="font-mono text-xs text-content-muted" title="owner_id (raccourci)">
                    {shortId(t.ownerId)}
                  </span>
                </div>
              </TD>
              <TD><TenantStatusChip status={t.status} /></TD>
              <TD>{t.swarmsCount}</TD>
              <TD>{t.runsCount}</TD>
              <TD className={t.activeRunsCount > 0 ? "text-[var(--color-running)]" : undefined}>
                {t.activeRunsCount}
              </TD>
              <TD className="text-xs text-content-faint">
                {t.quota.notConfigured ? "n/c" : `${t.quota.used}/${t.quota.limit ?? "∞"}`}
              </TD>
              <TD>
                <span className="text-xs">
                  <span className="text-[var(--color-ok)]">{toolsOn} on</span>
                  {toolsFail > 0 && (
                    <span className="text-danger"> · {toolsFail} fail-closed</span>
                  )}
                </span>
              </TD>
              <TD className={t.incidentsCount > 0 ? "text-danger" : "text-content-faint"}>
                {t.incidentsCount}
              </TD>
              <TD className="text-xs text-content-muted">
                {t.lastActivityAt ? new Date(t.lastActivityAt).toLocaleString("fr-FR") : "—"}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

function shortId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}
