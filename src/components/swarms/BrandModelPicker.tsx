"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BRANDS, getModelsForBrand } from "@/lib/automobile/brands";
import { BrandLogo } from "@/components/automobile/BrandLogo";
import { Label } from "@/components/ui";
import { cn } from "@/lib/ui/cn";

// ── Combobox searchable générique ─────────────────────────────────────────────

interface Option {
  value: string;
  withLogo?: boolean;
}

const TRIGGER =
  "flex w-full items-center gap-2 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 " +
  "text-left text-sm text-content ring-1 ring-inset ring-line transition-shadow " +
  "focus:outline-none focus:ring-2 focus:ring-accent";

function Combobox({
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
}: {
  value: string;
  options: Option[];
  placeholder: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.value.toLowerCase().includes(q));
  }, [options, query]);

  const exactMatch = options.some(
    (o) => o.value.toLowerCase() === query.trim().toLowerCase(),
  );

  function select(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(TRIGGER, disabled && "cursor-not-allowed opacity-50")}
      >
        {value ? (
          <>
            {options.find((o) => o.value === value)?.withLogo && (
              <BrandLogo brand={value} size={20} variant="inline" />
            )}
            <span className="flex-1 truncate">{value}</span>
          </>
        ) : (
          <span className="flex-1 text-content-faint">{placeholder}</span>
        )}
        <span className="text-xs text-content-faint">▾</span>
      </button>

      {open && !disabled && (
        <div
          className={cn(
            "absolute inset-x-0 top-[calc(100%+0.25rem)] z-[60] overflow-hidden",
            // Fond OPAQUE obligatoire : les tokens surface-* sont translucides,
            // qui laisseraient transparaître les champs du formulaire derrière
            // le dropdown. --color-elevated est opaque.
            "rounded-[var(--radius-md)] bg-elevated shadow-2xl ring-1 ring-inset ring-line-strong",
          )}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[0]) select(filtered[0].value);
                else if (query.trim()) select(query.trim());
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Rechercher…"
            className="w-full border-b border-line bg-surface-2 px-3 py-2 text-sm text-content outline-none placeholder:text-content-faint"
          />
          <ul className="max-h-64 overflow-y-auto">
            {filtered.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => select(opt.value)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-content transition-colors hover:bg-surface-2",
                    opt.value === value && "bg-surface-3",
                  )}
                >
                  {opt.withLogo && (
                    <BrandLogo brand={opt.value} size={20} variant="inline" />
                  )}
                  <span className="truncate">{opt.value}</span>
                </button>
              </li>
            ))}

            {/* Fallback saisie libre */}
            {query.trim() && !exactMatch && (
              <li>
                <button
                  type="button"
                  onClick={() => select(query.trim())}
                  className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm italic text-content-muted transition-colors hover:bg-surface-2"
                >
                  Utiliser «&nbsp;{query.trim()}&nbsp;»
                </button>
              </li>
            )}

            {filtered.length === 0 && !query.trim() && (
              <li className="px-3 py-2 text-sm text-content-faint">
                Aucun résultat
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Picker Marque → Modèle ────────────────────────────────────────────────────

export function BrandModelPicker({
  defaultMake = "",
  defaultModel = "",
}: {
  defaultMake?: string;
  defaultModel?: string;
}) {
  const [make, setMake] = useState(defaultMake);
  const [model, setModel] = useState(defaultModel);

  const brandOptions = useMemo<Option[]>(
    () => BRANDS.map((b) => ({ value: b.brand, withLogo: true })),
    [],
  );
  const modelOptions = useMemo<Option[]>(
    () => getModelsForBrand(make).map((m) => ({ value: m })),
    [make],
  );

  function onBrandChange(v: string) {
    setMake(v);
    setModel(""); // reset modèle quand la marque change
  }

  return (
    <>
      <div className="flex flex-col">
        <Label htmlFor="bmp-make">
          Marque<span className="ml-0.5 text-accent-strong">*</span>
        </Label>
        <Combobox
          value={make}
          options={brandOptions}
          placeholder="Choisir une marque"
          onChange={onBrandChange}
        />
        <input type="hidden" name="make" value={make} />
      </div>

      <div className="flex flex-col">
        <Label htmlFor="bmp-model">
          Modèle<span className="ml-0.5 text-accent-strong">*</span>
        </Label>
        <Combobox
          value={model}
          options={modelOptions}
          placeholder={make ? "Choisir un modèle" : "Choisir d'abord la marque"}
          disabled={!make}
          onChange={setModel}
        />
        <input type="hidden" name="model" value={model} />
      </div>
    </>
  );
}
