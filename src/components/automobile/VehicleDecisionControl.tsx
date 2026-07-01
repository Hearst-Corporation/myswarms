"use client";

import { useState, useTransition } from "react";
import { setVehicleDecision } from "@/app/automobile/[runId]/actions";
import { Button } from "@/components/ui";
import {
  VEHICLE_DECISION_STATUSES,
  DEFAULT_DECISION_STATUS,
  type VehicleDecisionStatus,
} from "@/lib/automobile/decisionStatus";

/**
 * Contrôle de décision humaine sur un run. Boutons de statut (optimiste +
 * Server Action). Le strict minimum : un clic = un statut enregistré.
 */
export function VehicleDecisionControl({
  runId,
  initial,
}: {
  runId: string;
  initial: VehicleDecisionStatus | null;
}) {
  const [status, setStatus] = useState<VehicleDecisionStatus>(
    initial ?? DEFAULT_DECISION_STATUS,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: VehicleDecisionStatus) {
    if (next === status || pending) return;
    const prev = status;
    setStatus(next); // optimiste
    setError(null);
    startTransition(async () => {
      const res = await setVehicleDecision(runId, next);
      if (!res.ok) {
        setStatus(prev); // rollback
        setError(res.error ?? "Échec de l'enregistrement");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {VEHICLE_DECISION_STATUSES.map((s) => {
          const active = s.value === status;
          return (
            <Button
              key={s.value}
              type="button"
              size="sm"
              variant={active ? "primary" : "secondary"}
              onClick={() => choose(s.value)}
              disabled={pending}
              aria-pressed={active}
              className={pending && !active ? "opacity-60" : undefined}
            >
              {s.label}
            </Button>
          );
        })}
      </div>
      <div className="mt-2 min-h-4 text-xs">
        {pending ? (
          <span className="text-content-faint">Enregistrement…</span>
        ) : error ? (
          <span className="text-danger">{error}</span>
        ) : (
          <span className="text-content-faint">
            Décision enregistrée pour ce véhicule.
          </span>
        )}
      </div>
    </div>
  );
}
