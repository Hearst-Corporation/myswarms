"use client";

import { useState } from "react";
import { brandLogoUrl } from "@/lib/automobile/brands";
import { SIZE } from "@/lib/ui/tokens";

/**
 * Logo de marque automobile avec deux variantes :
 *
 * - `variant="chip"` (défaut) : chip arrondi à fond blanc contenant le logo
 *   PNG. Le fond clair est obligatoire : les logos jsDelivr sont souvent
 *   sombres/colorés et seraient illisibles sur le thème foncé.
 *
 * - `variant="inline"` : simple `<img>` sans chip, pour les contextes où le
 *   fond clair jurerait (dropdown compact, liste dense). Le fond du contenant
 *   est géré par le parent.
 *
 * Fallback robuste dans les deux variantes : si l'image échoue (onError) ou
 * si la marque est inconnue, on affiche les initiales (1-2 lettres).
 */

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
  const fallbackFontSize = Math.max(11, Math.round(size * 0.32));

  if (variant === "inline") {
    if (showImg) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brandLogoUrl(brand)}
          alt=""
          className="inline-block shrink-0 object-contain"
          style={{ width: size, height: size }}
          onError={() => setFailed(true)}
          loading="lazy"
        />
      );
    }
    // Fallback initiales en inline
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface-3 font-bold leading-none text-content-muted"
        style={{ width: size, height: size, fontSize: fallbackFontSize }}
        aria-hidden
      >
        {hasBrand ? initials(brand) : ""}
      </span>
    );
  }

  // variant === "chip" (défaut) — fond blanc pour la lisibilité des logos.
  return (
    <span
      className="box-border inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-line bg-white p-1"
      style={{ width: size, height: size }}
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
          className="block max-h-full max-w-full object-contain"
        />
      ) : (
        <span
          className="font-bold leading-none text-canvas"
          style={{ fontSize: fallbackFontSize }}
        >
          {hasBrand ? initials(brand) : "—"}
        </span>
      )}
    </span>
  );
}
