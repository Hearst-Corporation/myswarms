import type { CSSProperties } from "react";
import { FONT, FONT_WEIGHT, LETTER_SPACING, SPACING } from "./tokens";

export interface TableStyleOpts {
  /** Vertical padding for both th and td (px). Default: SPACING.sm = 8. */
  padY?: number;
  /** Horizontal padding for both th and td (px). Default: SPACING.md = 12. */
  padX?: number;
  /** Override vertical padding for th only. Falls back to padY. */
  thPadY?: number;
  /** Override horizontal padding for th only. Falls back to padX. */
  thPadX?: number;
  /** Override vertical padding for td only. Falls back to padY. */
  tdPadY?: number;
  /** Override horizontal padding for td only. Falls back to padX. */
  tdPadX?: number;
  /** Font size for th. Default: FONT.xs = 10. */
  thFontSize?: number | string;
  /** Font size for td. Default: FONT.sm = 12. */
  tdFontSize?: number | string;
  /** Render borderBottom on both th and td. Default: true. */
  border?: boolean;
}

/**
 * Factory: returns { th, td } CSSProperties objects constructed from options.
 * Defaults reproduce the original thStyle / tdStyle values exactly.
 */
export function makeTableStyles(opts: TableStyleOpts = {}): {
  th: CSSProperties;
  td: CSSProperties;
} {
  const {
    padY = SPACING.sm,
    padX = SPACING.md,
    thPadY,
    thPadX,
    tdPadY,
    tdPadX,
    thFontSize = FONT.xs,
    tdFontSize = FONT.sm,
    border = true,
  } = opts;

  const resolvedThPadY = thPadY ?? padY;
  const resolvedThPadX = thPadX ?? padX;
  const resolvedTdPadY = tdPadY ?? padY;
  const resolvedTdPadX = tdPadX ?? padX;

  const th: CSSProperties = {
    padding: `${resolvedThPadY}px ${resolvedThPadX}px`,
    fontSize: thFontSize,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: LETTER_SPACING.wide,
    textTransform: "uppercase",
    color: "var(--ct-text-muted)",
    whiteSpace: "nowrap",
    textAlign: "left",
    ...(border ? { borderBottom: "1px solid var(--ct-border)" } : {}),
  };

  const td: CSSProperties = {
    padding: `${resolvedTdPadY}px ${resolvedTdPadX}px`,
    fontSize: tdFontSize,
    color: "var(--ct-text-body)",
    verticalAlign: "middle",
    ...(border ? { borderBottom: "1px solid var(--ct-border)" } : {}),
  };

  return { th, td };
}

// ─── Canonical exports (used by sourcing, historique, UserTable, etc.) ─────────
// Reconstructed via makeTableStyles() with defaults → values identical to before.
const _defaults = makeTableStyles();

/**
 * Shared style for table header cells (th).
 * padding: 8px 12px · fontSize: 10 · bold · uppercase · muted · borderBottom.
 */
export const thStyle: React.CSSProperties = _defaults.th;

/**
 * Shared style for table data cells (td).
 * padding: 8px 12px · fontSize: 12 · body color · borderBottom · verticalAlign middle.
 */
export const tdStyle: React.CSSProperties = _defaults.td;
