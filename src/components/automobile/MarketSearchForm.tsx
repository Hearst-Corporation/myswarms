"use client";

import { BrandModelPicker } from "@/components/swarms/BrandModelPicker";
import { Button, Field, Select } from "@/components/ui";

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
    <form method="GET" action="/automobile/marche" className="flex flex-col gap-6">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6">
        <BrandModelPicker defaultMake={defaultMake} defaultModel={defaultModel} />

        <Field label="Carburant" htmlFor="market-fuel">
          <Select id="market-fuel" name="fuel" defaultValue={defaultFuel}>
            {FUEL_OPTIONS.map((f) => (
              <option key={f || "all"} value={f}>
                {f === "" ? "Tous" : f}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit">Voir la cote</Button>
      </div>
    </form>
  );
}
