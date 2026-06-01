"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { FONT, FONT_WEIGHT, RADIUS, SPACING, LETTER_SPACING } from "@/lib/ui/tokens";

const MARKET_OPTIONS = [
  { value: "fr", label: "France" },
  { value: "de", label: "Allemagne" },
  { value: "it", label: "Italie" },
  { value: "es", label: "Espagne" },
  { value: "be", label: "Belgique" },
  { value: "nl", label: "Pays-Bas" },
  { value: "at", label: "Autriche" },
  { value: "ch", label: "Suisse" },
] as const;

const LABEL_STYLE = {
  display: "block",
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.semibold,
  color: "var(--ct-text-muted)",
  marginBottom: SPACING.xs,
  textTransform: "uppercase" as const,
  letterSpacing: LETTER_SPACING.wide,
};

const INPUT_STYLE = {
  width: "100%",
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontFamily: "inherit",
  boxSizing: "border-box" as const,
};

/**
 * Formulaire de recherche sourcing AutoScout24.
 * Soumet en GET → met à jour les searchParams que la page serveur lit.
 * Calqué sur MarketSearchForm (navigation via router.push + query params).
 */
export function SourcingSearchForm({
  defaultMake = "",
  defaultModel = "",
  defaultMarket = "fr",
  defaultPriceMin = "",
  defaultPriceMax = "",
}: {
  defaultMake?: string;
  defaultModel?: string;
  defaultMarket?: string;
  defaultPriceMin?: string;
  defaultPriceMax?: string;
}) {
  const router = useRouter();
  useSearchParams(); // force re-render on param change

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const params = new URLSearchParams();
      const make = (fd.get("make") as string ?? "").trim();
      if (!make) return; // make obligatoire
      params.set("make", make);
      const model = (fd.get("model") as string ?? "").trim();
      if (model) params.set("model", model);
      const market = (fd.get("market") as string ?? "fr").trim();
      if (market && market !== "fr") params.set("market", market);
      const priceMin = (fd.get("priceMin") as string ?? "").trim();
      if (priceMin) params.set("priceMin", priceMin);
      const priceMax = (fd.get("priceMax") as string ?? "").trim();
      if (priceMax) params.set("priceMax", priceMax);
      router.push(`/automobile/sourcing?${params.toString()}`);
    },
    [router],
  );

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: SPACING.lg,
        }}
      >
        {/* Marque */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label htmlFor="sourcing-make" style={LABEL_STYLE}>
            Marque *
          </label>
          <input
            id="sourcing-make"
            name="make"
            type="text"
            placeholder="ex: BMW"
            defaultValue={defaultMake}
            required
            style={INPUT_STYLE}
          />
        </div>

        {/* Modèle */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label htmlFor="sourcing-model" style={LABEL_STYLE}>
            Modèle
          </label>
          <input
            id="sourcing-model"
            name="model"
            type="text"
            placeholder="ex: X2"
            defaultValue={defaultModel}
            style={INPUT_STYLE}
          />
        </div>

        {/* Marché */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label htmlFor="sourcing-market" style={LABEL_STYLE}>
            Marché
          </label>
          <select
            id="sourcing-market"
            name="market"
            defaultValue={defaultMarket}
            style={{
              ...INPUT_STYLE,
              appearance: "none",
              cursor: "pointer",
            }}
          >
            {MARKET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Prix min */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label htmlFor="sourcing-price-min" style={LABEL_STYLE}>
            Prix min (€)
          </label>
          <input
            id="sourcing-price-min"
            name="priceMin"
            type="number"
            min={0}
            placeholder="ex: 5000"
            defaultValue={defaultPriceMin}
            style={INPUT_STYLE}
          />
        </div>

        {/* Prix max */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <label htmlFor="sourcing-price-max" style={LABEL_STYLE}>
            Prix max (€)
          </label>
          <input
            id="sourcing-price-max"
            name="priceMax"
            type="number"
            min={0}
            placeholder="ex: 30000"
            defaultValue={defaultPriceMax}
            style={INPUT_STYLE}
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" className="ct-seg-btn primary">
          Lancer la recherche
        </button>
      </div>
    </form>
  );
}
