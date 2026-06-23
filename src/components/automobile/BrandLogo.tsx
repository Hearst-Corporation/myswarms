"use client";

import { useState } from "react";
import { brandLogoUrl } from "@/lib/automobile/brands";
import { RADIUS, SPACING, FONT, FONT_WEIGHT, COLOR, SIZE } from "@/lib/ui/tokens";

/**
 * Logo de marque automobile avec deux variantes :
 *
 * - `variant="chip"` (défaut) : chip arrondi à fond clair (COLOR.textStrong =
 *   --ct-text-strong = blanc pur) contenant le logo PNG. Le fond clair est
 *   obligatoire : les logos jsDelivr sont souvent sombres/colorés et seraient
 *   illisibles sur le thème cockpit foncé. Tout passe par les tokens --ct-*.
 *
 * - `variant="inline"` : simple `<img>` sans chip, pour les contextes où le
 *   fond clair jurerait (dropdown compact, liste dense). Le fond du contenant
 *   est géré par le parent.
 *
 * Fallback robuste dans les deux variantes : si l'image échoue (onError) ou
 * si la marque est inconnue, on affiche les initiales (1-2 lettres).
 */

const CHIP_BG = COLOR.textStrong; // blanc pur (--ct-text-strong) — lisibilité des logos colorés
const DEFAULT_SIZE = SIZE.avatar;

function initials(brand: string): string {
  const trimmed = brand.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function BrandLogo({
  brand,
  size = DEFAULT_SIZE,
  variant = "chip",
}: {
  brand: string;
  size?: number;
  variant?: "chip" | "inline";
}) {
  const [failed, setFailed] = useState(false);
  const hasBrand = brand.trim() !== "";
  const showImg = hasBrand && !failed;

  if (variant === "inline") {
    const inlineStyle: React.CSSProperties = {
      width: size,
      height: size,
      objectFit: "contain",
      flexShrink: 0,
      display: "inline-block",
    };
    if (showImg) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brandLogoUrl(brand)}
          alt=""
          style={inlineStyle}
          onError={() => setFailed(true)}
          loading="lazy"
        />
      );
    }
    // Fallback initiales en inline
    return (
      <span
        style={{
          ...inlineStyle,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--ct-surface-3)",
          borderRadius: RADIUS.sm,
          fontSize: Math.max(FONT.xs, Math.round(size * 0.32)),
          fontWeight: FONT_WEIGHT.bold,
          color: "var(--ct-text-muted)",
          lineHeight: 1,
        }}
        aria-hidden
      >
        {hasBrand ? initials(brand) : ""}
      </span>
    );
  }

  // variant === "chip" (défaut)
  const chipStyle: React.CSSProperties = {
    width: size,
    height: size,
    flex: "0 0 auto",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: CHIP_BG,
    borderRadius: RADIUS.md,
    border: "1px solid var(--ct-border)",
    padding: SPACING.xs,
    boxSizing: "border-box",
    overflow: "hidden",
  };

  return (
    <span
      style={chipStyle}
      title={hasBrand ? brand : undefined}
      aria-label={hasBrand ? brand : "marque inconnue"}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brandLogoUrl(brand)}
          alt={brand}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            display: "block",
          }}
        />
      ) : (
        <span
          style={{
            fontSize: Math.max(FONT.xs, Math.round(size * 0.32)),
            fontWeight: FONT_WEIGHT.bold,
            color: "var(--ct-bg-deep)",
            lineHeight: 1,
          }}
        >
          {hasBrand ? initials(brand) : "—"}
        </span>
      )}
    </span>
  );
}
