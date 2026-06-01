import type { Recommendation } from "@/lib/swarms/recommendation";
import { FONT, FONT_WEIGHT, RADIUS, SPACING, LETTER_SPACING } from "@/lib/ui/tokens";

/**
 * Badge de recommandation APM — couleurs pilotées par CSS variables
 * (`--rec-<state>-color` / `--rec-<state>-bg`, définies dans cockpit.css).
 *
 * Défaut : palette sémantique vert/bordeaux/rouge.
 * Espace automobile ([data-product="automobile"]) : accent or + léger dégradé,
 * différencié par intensité (pas de teinte verte/rouge).
 *
 * `size="sm"` (défaut) : pill compact pour les listes/tableaux.
 * `size="md"` : grand badge pour la page de détail d'un run.
 */
const REC_META: Record<Recommendation, { key: string; label: string }> = {
  APPELER:  { key: "appeler", label: "Appeler" },
  ATTENDRE: { key: "attendre", label: "Attendre" },
  "ÉVITER": { key: "eviter", label: "Éviter" },
  UNKNOWN:  { key: "unknown", label: "—" },
};

export function RecommendationBadge({
  rec,
  size = "sm",
}: {
  rec: Recommendation;
  size?: "sm" | "md";
}) {
  const m = REC_META[rec];
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
        color: `var(--rec-${m.key}-color)`,
        background: `var(--rec-${m.key}-bg)`,
      }}
    >
      {rec === "UNKNOWN" ? "—" : isMd ? m.label : rec}
    </span>
  );
}
