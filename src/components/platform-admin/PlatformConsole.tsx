"use client";

/**
 * Platform Admin Console — composant racine client.
 *
 * Orchestration : overview + table tenants + drawer detail + filtre + refresh.
 * Reçoit l'agrégation initiale (server, rédactée) en props, peut rafraîchir via
 * GET /api/admin/platform/tenants. Aucun secret côté client.
 */

import { useMemo, useState, useCallback } from "react";
import type {
  BackendStatus,
  GovernanceActionState,
  PlatformOverview,
  PlatformTenant,
  SecurityGate,
  TenantStatus,
} from "@/lib/platform-admin/types";
import { Card, CardBody, Input, Button, Alert } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import { Overview } from "./Overview";
import { TenantTable } from "./TenantTable";
import { TenantDrawer } from "./TenantDrawer";

type StatusFilter = TenantStatus | "all";

const FILTERS: StatusFilter[] = ["all", "active", "pending", "suspended", "blocked", "internal", "unknown"];

export function PlatformConsole({
  initialTenants,
  initialOverview,
  initialBackend,
  initialGates,
  governanceActions,
  loadError,
}: {
  initialTenants: PlatformTenant[];
  initialOverview: PlatformOverview | null;
  initialBackend: BackendStatus | null;
  initialGates: SecurityGate[];
  governanceActions: GovernanceActionState[];
  loadError: string | null;
}) {
  const [tenants, setTenants] = useState(initialTenants);
  const [overview, setOverview] = useState(initialOverview);
  const [backend, setBackend] = useState(initialBackend);
  const [gates, setGates] = useState(initialGates);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/platform/tenants");
      if (!res.ok) return;
      const data = (await res.json()) as {
        tenants: PlatformTenant[];
        overview: PlatformOverview;
        backend: BackendStatus;
        gates: SecurityGate[];
      };
      setTenants(data.tenants);
      setOverview(data.overview);
      setBackend(data.backend);
      setGates(data.gates);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.ownerId.toLowerCase().includes(q) ||
        t.label.toLowerCase().includes(q) ||
        (t.emailMasked ?? "").toLowerCase().includes(q)
      );
    });
  }, [tenants, query, statusFilter]);

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <Alert tone="error" role="alert">{loadError}</Alert>
      )}

      <Overview overview={overview} backend={backend} gates={gates} />

      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-content-strong">
              Tenants — {filtered.length}
            </span>

            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium transition-colors",
                    statusFilter === f
                      ? "bg-accent/15 text-accent-strong ring-1 ring-inset ring-accent/30"
                      : "text-content-muted hover:bg-surface-2 hover:text-content",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrer (owner id, label…)"
                aria-label="Filtrer les tenants"
                className="h-8 w-52 text-xs"
              />
              <Button variant="secondary" size="sm" onClick={refresh} disabled={refreshing}>
                {refreshing ? "…" : "Actualiser"}
              </Button>
            </div>
          </div>

          <TenantTable tenants={filtered} selectedOwnerId={selected} onSelect={setSelected} />
        </CardBody>
      </Card>

      {selected && (
        <TenantDrawer
          key={selected}
          ownerId={selected}
          governanceActions={governanceActions}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
