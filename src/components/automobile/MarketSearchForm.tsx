"use client";

import { BrandModelPicker } from "@/components/swarms/BrandModelPicker";
import { FONT, FONT_WEIGHT, RADIUS, SPACING, LETTER_SPACING } from "@/lib/ui/tokens";

const FUEL_OPTIONS = ["", "essence", "diesel", "hybride", "électrique"] as const;

/**
 * Formulaire de recherche de cote marché. Soumet en GET → met à jour les
 * searchParams (?make=&model=&fuel=) que la page serveur lit pour interroger
 * l'intelligence marché APM. Réutilise le sélecteur Marque→Modèle avec logos.
 */
export function MarketSearchForm({
  defaultMake = "",
  defaultModel = "",
  defaultFuel = "",
}: {
  defaultMake?: string;
  defaultModel?: string;
  defaultFuel?: string;
}) {
  return (
    <form
      method="GET"
      action="/automobile/marche"
      style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: SPACING.lg,
        }}
      >
        <BrandModelPicker defaultMake={defaultMake} defaultModel={defaultModel} />

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <label
            htmlFor="market-fuel"
            style={{
              display: "block",
              fontSize: FONT.xs,
              fontWeight: FONT_WEIGHT.semibold,
              color: "var(--ct-text-muted)",
              marginBottom: SPACING.xs,
              textTransform: "uppercase",
              letterSpacing: LETTER_SPACING.wide,
            }}
          >
            Carburant
          </label>
          <select
            id="market-fuel"
            name="fuel"
            defaultValue={defaultFuel}
            style={{
              width: "100%",
              background: "var(--ct-surface-2)",
              border: "1px solid var(--ct-border)",
              borderRadius: RADIUS.md,
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              color: "var(--ct-text-primary)",
              fontSize: FONT.base,
              fontFamily: "inherit",
              boxSizing: "border-box",
              appearance: "none",
              cursor: "pointer",
            }}
          >
            {FUEL_OPTIONS.map((f) => (
              <option key={f || "all"} value={f}>
                {f === "" ? "Tous" : f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" className="ct-seg-btn primary">
          Voir la cote
        </button>
      </div>
    </form>
  );
}
