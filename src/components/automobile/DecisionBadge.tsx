import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";
import {
  decisionLabel,
  type VehicleDecisionStatus,
} from "@/lib/automobile/decisionStatus";

// Couleur par statut (variables CSS du cockpit uniquement).
const COLORS: Record<VehicleDecisionStatus, { fg: string; bg: string }> = {
  a_decider: { fg: "var(--ct-text-muted)", bg: "var(--ct-surface-3)" },
  appeler: { fg: "var(--ct-accent-strong)", bg: "var(--ct-accent-soft)" },
  ignorer: { fg: "var(--ct-text-faint)", bg: "var(--ct-surface-3)" },
  appele: { fg: "var(--ct-state-ok)", bg: "var(--ct-surface-3)" },
  negociation: { fg: "var(--ct-accent-strong)", bg: "var(--ct-accent-soft)" },
  achete: { fg: "var(--ct-state-ok)", bg: "var(--ct-surface-3)" },
  perdu: { fg: "var(--ct-alert-error-text)", bg: "var(--ct-surface-3)" },
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
  const c = COLORS[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: `${SPACING.hair}px ${SPACING.sm}px`,
        borderRadius: RADIUS.full,
        fontSize: FONT.xs,
        fontWeight: FONT_WEIGHT.bold,
        letterSpacing: LETTER_SPACING.tight,
        textTransform: "uppercase",
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.fg}`,
        whiteSpace: "nowrap",
      }}
    >
      {decisionLabel(status)}
    </span>
  );
}
