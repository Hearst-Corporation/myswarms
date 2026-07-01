"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button, Field, Input, Select } from "@/components/ui";

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-6">
        <Field label="Marque *" htmlFor="sourcing-make">
          <Input
            id="sourcing-make"
            name="make"
            type="text"
            placeholder="ex: BMW"
            defaultValue={defaultMake}
            required
          />
        </Field>

        <Field label="Modèle" htmlFor="sourcing-model">
          <Input
            id="sourcing-model"
            name="model"
            type="text"
            placeholder="ex: X2"
            defaultValue={defaultModel}
          />
        </Field>

        <Field label="Marché" htmlFor="sourcing-market">
          <Select id="sourcing-market" name="market" defaultValue={defaultMarket}>
            {MARKET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Prix min (€)" htmlFor="sourcing-price-min">
          <Input
            id="sourcing-price-min"
            name="priceMin"
            type="number"
            min={0}
            placeholder="ex: 5000"
            defaultValue={defaultPriceMin}
          />
        </Field>

        <Field label="Prix max (€)" htmlFor="sourcing-price-max">
          <Input
            id="sourcing-price-max"
            name="priceMax"
            type="number"
            min={0}
            placeholder="ex: 30000"
            defaultValue={defaultPriceMax}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit">Lancer la recherche</Button>
      </div>
    </form>
  );
}
