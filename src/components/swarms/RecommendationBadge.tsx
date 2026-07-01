import type { CSSProperties } from "react";
import type { Recommendation } from "@/lib/swarms/recommendation";
import { cn } from "@/lib/ui/cn";

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
  APPELER: { key: "appeler", label: "Appeler" },
  ATTENDRE: { key: "attendre", label: "Attendre" },
  "ÉVITER": { key: "eviter", label: "Éviter" },
  UNKNOWN: { key: "unknown", label: "—" },
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
  // Couleur pilotée par le produit via CSS variables (contrat de theming,
  // pas un token de présentation legacy — conservé volontairement).
  const colorStyle: CSSProperties = {
    color: `var(--rec-${m.key}-color)`,
    background: `var(--rec-${m.key}-bg)`,
  };
  return (
    <span
      className={cn(
        "inline-block rounded-full font-bold uppercase tracking-wide",
        isMd ? "px-4 py-1.5 text-base" : "px-2.5 py-0.5 text-xs",
      )}
      style={colorStyle}
    >
      {rec === "UNKNOWN" ? "—" : isMd ? m.label : rec}
    </span>
  );
}
