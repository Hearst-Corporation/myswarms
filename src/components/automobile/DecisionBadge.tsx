import { Badge } from "@/components/ui";
import type { BadgeProps } from "@/components/ui/Badge";
import {
  decisionLabel,
  type VehicleDecisionStatus,
} from "@/lib/automobile/decisionStatus";

// Ton du Badge par statut de décision humaine.
const TONE_BY_STATUS: Record<VehicleDecisionStatus, BadgeProps["tone"]> = {
  a_decider: "neutral",
  appeler: "accent",
  ignorer: "neutral",
  appele: "ok",
  negociation: "accent",
  achete: "ok",
  perdu: "danger",
};

/**
 * Pill de statut décision humaine. Server-safe (pas de hook) → utilisable
 * dans les Server Components (dashboard) et Client Components (historique).
 * `status = null` → rien (pas encore décidé / non chargé).
 */
export function DecisionBadge({
  status,
  muteDefault = false,
}: {
  status: VehicleDecisionStatus | null;
  muteDefault?: boolean;
}) {
  if (!status) return null;
  if (muteDefault && status === "a_decider") return null;
  return (
    <Badge tone={TONE_BY_STATUS[status]} className="uppercase tracking-tight">
      {decisionLabel(status)}
    </Badge>
  );
}
