"use client";

/**
 * Platform Admin — header overview : KPIs tenant, statut backend, security gates.
 * Dense, déterministe. Aucun secret.
 */

import { Card, CardBody, StatCard } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import type {
  BackendStatus,
  PlatformOverview,
  SecurityGate,
} from "@/lib/platform-admin/types";

function GateRow({ gate }: { gate: SecurityGate }) {
  const dotClass =
    gate.status === "enforced"
      ? "text-[var(--color-ok)]"
      : gate.status === "degraded"
        ? "text-danger"
        : "text-content-faint";
  return (
    <div title={gate.detail} className="inline-flex items-center gap-1 text-xs text-content-muted">
      <span className={cn("font-medium", dotClass)}>●</span>
      <span className="font-mono">{gate.key}</span>
      <span className="text-content-faint">{gate.label}</span>
    </div>
  );
}

export function Overview({
  overview,
  backend,
  gates,
}: {
  overview: PlatformOverview | null;
  backend: BackendStatus | null;
  gates: SecurityGate[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Owners" value={overview?.totalOwners ?? 0} />
        <StatCard label="Active" value={overview?.active ?? 0} />
        <StatCard label="Pending" value={overview?.pending ?? 0} />
        <StatCard label="Suspended" value={overview?.suspended ?? 0} />
        <StatCard label="Blocked" value={overview?.blocked ?? 0} />
        <StatCard label="Internal" value={overview?.internal ?? 0} />
        <StatCard label="Runs / 24h" value={overview?.runsToday ?? 0} />
        <StatCard label="Runs / 7j" value={overview?.runsWeek ?? 0} />
        <StatCard label="Active runs" value={overview?.activeRuns ?? 0} />
        <StatCard label="Mappings n/c" value={overview?.unconfiguredMappings ?? 0} />
      </div>

      {/* Backend + gates */}
      <Card>
        <CardBody className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex flex-wrap gap-6">
            <BackendDot ok={Boolean(backend?.engineConfigured)} label="Engine" />
            <BackendDot ok={Boolean(backend?.cortexConfigured)} label="Cortex" />
            <BackendDot ok={Boolean(backend?.schedulerOwnerConfigured)} label="Scheduler" />
          </div>
          <div className="flex flex-wrap gap-4 sm:ml-auto">
            {gates.map((g) => (
              <GateRow key={g.key} gate={g} />
            ))}
          </div>
        </CardBody>
        {backend?.syncedAt && (
          <div className="border-t border-line px-5 py-2 text-[10px] text-content-faint">
            Dernière synchro : {new Date(backend.syncedAt).toLocaleString("fr-FR")}
          </div>
        )}
      </Card>
    </div>
  );
}

function BackendDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-content-muted">
      <span className={ok ? "text-[var(--color-ok)]" : "text-content-faint"}>●</span>
      {label}
      <span className={ok ? "text-[var(--color-ok)]" : "text-content-faint"}>
        {ok ? "configuré" : "non configuré"}
      </span>
    </span>
  );
}
