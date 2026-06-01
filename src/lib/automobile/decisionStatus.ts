// Statuts de décision humaine — module PUR (client-safe, aucune dépendance DB).
// Les fonctions DB (lecture/écriture) vivent dans ./decisions (server-only).

export const VEHICLE_DECISION_STATUSES = [
  { value: "a_decider", label: "À décider" },
  { value: "appeler", label: "Appeler" },
  { value: "ignorer", label: "Ignorer" },
  { value: "appele", label: "Appelé" },
  { value: "negociation", label: "Négociation" },
  { value: "achete", label: "Acheté" },
  { value: "perdu", label: "Perdu" },
] as const;

export type VehicleDecisionStatus = (typeof VEHICLE_DECISION_STATUSES)[number]["value"];

export const DEFAULT_DECISION_STATUS: VehicleDecisionStatus = "a_decider";

const VALID = new Set<string>(VEHICLE_DECISION_STATUSES.map((s) => s.value));

export function isVehicleDecisionStatus(v: string): v is VehicleDecisionStatus {
  return VALID.has(v);
}

export function decisionLabel(status: VehicleDecisionStatus): string {
  return VEHICLE_DECISION_STATUSES.find((s) => s.value === status)?.label ?? status;
}
