"use client";

/**
 * Platform Admin Console — composant racine client.
 *
 * Orchestration : overview + table tenants + drawer detail + filtre + refresh.
 * Reçoit l'agrégation initiale (server, rédactée) en props, peut rafraîchir via
 * GET /api/admin/platform/tenants. Aucun secret côté client.
 */

import { useMemo, useState, useCallback } from "react";
import { SPACING, FONT, FONT_WEIGHT } from "@/lib/ui/tokens";
import type {
  BackendStatus,
  GovernanceActionState,
  PlatformOverview,
  PlatformTenant,
  SecurityGate,
  TenantStatus,
} from "@/lib/platform-admin/types";
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
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xl }}>
      {loadError && (
        <div
          style={{
            color: "var(--ct-alert-error-text)",
            background: "var(--ct-alert-error-bg)",
            border: "1px solid var(--ct-alert-error-border)",
            padding: SPACING.md,
            borderRadius: 4,
            fontSize: FONT.sm,
          }}
        >
          {loadError}
        </div>
      )}

      <Overview overview={overview} backend={backend} gates={gates} />

      <section className="ct-card" style={{ padding: SPACING.lx, display: "flex", flexDirection: "column", gap: SPACING.lg }}>
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.md, flexWrap: "wrap" }}>
          <span style={{ fontSize: FONT.md, fontWeight: FONT_WEIGHT.medium, color: "var(--ct-text-strong)" }}>
            Tenants — {filtered.length}
          </span>

          <div style={{ display: "flex", gap: SPACING.xxs, flexWrap: "wrap", marginLeft: SPACING.md }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="ct-seg-btn"
                onClick={() => setStatusFilter(f)}
                style={{
                  fontSize: FONT.xxs,
                  opacity: statusFilter === f ? 1 : 0.6,
                  fontWeight: statusFilter === f ? FONT_WEIGHT.medium : FONT_WEIGHT.regular,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer (owner id, label…)"
            style={{
              marginLeft: "auto",
              fontSize: FONT.xs,
              padding: `${SPACING.xs}px ${SPACING.sm}px`,
              background: "var(--ct-overlay-dark)",
              border: "1px solid var(--ct-border-soft)",
              borderRadius: 6,
              color: "var(--ct-text-body)",
              minWidth: 200,
            }}
          />

          <button type="button" className="ct-seg-btn" onClick={refresh} disabled={refreshing} style={{ fontSize: FONT.xs }}>
            {refreshing ? "…" : "Actualiser"}
          </button>
        </div>

        <TenantTable tenants={filtered} selectedOwnerId={selected} onSelect={setSelected} />
      </section>

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
