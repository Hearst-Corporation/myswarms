"use client";

import { useState, useTransition } from "react";
import { setVehicleDecision } from "@/app/automobile/[runId]/actions";
import {
  VEHICLE_DECISION_STATUSES,
  DEFAULT_DECISION_STATUS,
  type VehicleDecisionStatus,
} from "@/lib/automobile/decisionStatus";
import { FONT, SPACING } from "@/lib/ui/tokens";

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
      <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING.sm }}>
        {VEHICLE_DECISION_STATUSES.map((s) => {
          const active = s.value === status;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => choose(s.value)}
              disabled={pending}
              aria-pressed={active}
              className={`ct-seg-btn${active ? " primary" : ""}`}
              style={{ fontSize: FONT.sm, opacity: pending && !active ? 0.6 : 1 }}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: SPACING.sm, fontSize: FONT.xs, minHeight: 16 }}>
        {pending ? (
          <span style={{ color: "var(--ct-text-faint)" }}>Enregistrement…</span>
        ) : error ? (
          <span style={{ color: "var(--ct-alert-error-text)" }}>{error}</span>
        ) : (
          <span style={{ color: "var(--ct-text-faint)" }}>
            Décision enregistrée pour ce véhicule.
          </span>
        )}
      </div>
    </div>
  );
}
