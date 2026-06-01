"use client";

import { useState } from "react";
import { brandLogoUrl } from "@/lib/automobile/brands";
import { RADIUS, SPACING, FONT, FONT_WEIGHT } from "@/lib/ui/tokens";

/**
 * Chip arrondi à fond clair contenant le logo PNG d'une marque.
 *
 * Pourquoi un fond clair en dur (#fff) ? Les logos du dataset jsDelivr sont
 * souvent sombres / colorés ; sur le thème cockpit foncé ils seraient illisibles
 * sans un chip clair derrière. C'est la SEULE couleur en dur tolérée ici, et
 * uniquement pour le fond du chip logo (justifié). Tout le reste passe par les
 * variables --ct-*.
 *
 * Fallback robuste : si l'image échoue (onError) ou si la marque est inconnue,
 * on affiche les initiales de la marque (1-2 lettres) dans le même chip.
 */

const CHIP_BG = "#ffffff"; // fond clair obligatoire pour la lisibilité des logos colorés
const DEFAULT_SIZE = 36;

function initials(brand: string): string {
  const trimmed = brand.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function BrandLogo({ brand, size = DEFAULT_SIZE }: { brand: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const hasBrand = brand.trim() !== "";
  const showImg = hasBrand && !failed;

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
