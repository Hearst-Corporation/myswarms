import { FONT, FONT_WEIGHT, LETTER_SPACING, SPACING } from "./tokens";

/**
 * Style partagé pour les en-têtes de colonnes de table (th).
 * Utilisation : <th style={thStyle}>...</th>
 */
export const thStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.bold,
  letterSpacing: LETTER_SPACING.wide,
  textTransform: "uppercase" as const,
  color: "var(--ct-text-muted)",
  borderBottom: "1px solid var(--ct-border)",
  whiteSpace: "nowrap" as const,
  textAlign: "left" as const,
};

/**
 * Style partagé pour les cellules de données de table (td).
 */
export const tdStyle: React.CSSProperties = {
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  fontSize: FONT.sm,
  color: "var(--ct-text-body)",
  borderBottom: "1px solid var(--ct-border)",
  verticalAlign: "middle" as const,
};
