import type { Recommendation } from "@/lib/swarms/recommendation";
import { FONT, FONT_WEIGHT, RADIUS, SPACING, LETTER_SPACING } from "@/lib/ui/tokens";

/**
 * Badge de recommandation APM — composant partagé (remplace les 3 copies
 * locales qui existaient dans automobile/page.tsx, historique/page.tsx et
 * [runId]/page.tsx). Palette sémantique : vert (APPELER) / bordeaux (ATTENDRE)
 * / rouge (ÉVITER) / neutre (UNKNOWN).
 *
 * `size="sm"` (défaut) : pill compact pour les listes/tableaux.
 * `size="md"` : grand badge pour la page de détail d'un run.
 */
const REC_STYLE: Record<Recommendation, { color: string; bg: string; label: string }> = {
  APPELER:  { color: "var(--ct-state-ok)",         bg: "rgba(39,174,96,0.12)", label: "Appeler" },
  ATTENDRE: { color: "var(--ct-accent-strong)",    bg: "rgba(192,57,43,0.10)", label: "Attendre" },
  "ÉVITER": { color: "var(--ct-alert-error-text)", bg: "rgba(231,76,60,0.12)", label: "Éviter" },
  UNKNOWN:  { color: "var(--ct-text-faint)",       bg: "var(--ct-surface-3)",  label: "—" },
};

export function RecommendationBadge({
  rec,
  size = "sm",
}: {
  rec: Recommendation;
  size?: "sm" | "md";
}) {
  const s = REC_STYLE[rec];
  const isMd = size === "md";
  return (
    <span
      style={{
        display: "inline-block",
        padding: isMd ? `${SPACING.sm}px ${SPACING.lg}px` : `${SPACING.xs}px ${SPACING.sm}px`,
        borderRadius: RADIUS.full,
        fontSize: isMd ? FONT.md : FONT.xs,
        fontWeight: FONT_WEIGHT.bold,
        letterSpacing: LETTER_SPACING.wide,
        textTransform: "uppercase",
        color: s.color,
        background: s.bg,
      }}
    >
      {rec === "UNKNOWN" ? "—" : isMd ? s.label : rec}
    </span>
  );
}
