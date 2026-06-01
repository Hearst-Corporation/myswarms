"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BRANDS, getModelsForBrand } from "@/lib/automobile/brands";
import { BrandLogo } from "@/components/automobile/BrandLogo";
import { FONT, FONT_WEIGHT, RADIUS, SPACING, LETTER_SPACING } from "@/lib/ui/tokens";

// ── Styles partagés (alignés sur SwarmInputForm) ─────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.semibold,
  color: "var(--ct-text-muted)",
  marginBottom: SPACING.xs,
  textTransform: "uppercase",
  letterSpacing: LETTER_SPACING.wide,
};

const triggerBase: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: SPACING.sm,
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontFamily: "inherit",
  cursor: "pointer",
  textAlign: "left",
  boxSizing: "border-box",
};

// ── Combobox searchable générique ─────────────────────────────────────────────

interface Option {
  value: string;
  withLogo?: boolean;
}

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

  const exactMatch = options.some((o) => o.value.toLowerCase() === query.trim().toLowerCase());

  function select(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          ...triggerBase,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {value ? (
          <>
            {options.find((o) => o.value === value)?.withLogo && <BrandLogo brand={value} size={20} variant="inline" />}
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {value}
            </span>
          </>
        ) : (
          <span style={{ flex: 1, color: "var(--ct-text-faint)" }}>{placeholder}</span>
        )}
        <span style={{ color: "var(--ct-text-faint)", fontSize: FONT.xs }}>▾</span>
      </button>

      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            // Fond OPAQUE obligatoire : les tokens --ct-surface-* sont des
            // blancs translucides (~4%), qui laisseraient transparaître les
            // champs du formulaire derrière le dropdown. --ct-bg-deep est le
            // seul token opaque du thème.
            background: "var(--ct-bg-deep)",
            border: "1px solid var(--ct-border-strong)",
            borderRadius: RADIUS.md,
            boxShadow: "var(--ct-shadow-depth)",
            overflow: "hidden",
          }}
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
            style={{
              width: "100%",
              background: "var(--ct-surface-2)",
              border: "none",
              borderBottom: "1px solid var(--ct-border)",
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              color: "var(--ct-text-primary)",
              fontSize: FONT.sm,
              fontFamily: "inherit",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {filtered.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => select(opt.value)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.sm,
                    background: opt.value === value ? "var(--ct-surface-3)" : "transparent",
                    border: "none",
                    padding: `${SPACING.sm}px ${SPACING.md}px`,
                    color: "var(--ct-text-primary)",
                    fontSize: FONT.sm,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {opt.withLogo && <BrandLogo brand={opt.value} size={20} variant="inline" />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.value}
                  </span>
                </button>
              </li>
            ))}

            {/* Fallback saisie libre */}
            {query.trim() && !exactMatch && (
              <li>
                <button
                  type="button"
                  onClick={() => select(query.trim())}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: SPACING.sm,
                    background: "transparent",
                    border: "none",
                    borderTop: "1px solid var(--ct-border-soft)",
                    padding: `${SPACING.sm}px ${SPACING.md}px`,
                    color: "var(--ct-text-muted)",
                    fontSize: FONT.sm,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    textAlign: "left",
                    fontStyle: "italic",
                  }}
                >
                  Utiliser «&nbsp;{query.trim()}&nbsp;»
                </button>
              </li>
            )}

            {filtered.length === 0 && !query.trim() && (
              <li style={{ padding: `${SPACING.sm}px ${SPACING.md}px`, color: "var(--ct-text-faint)", fontSize: FONT.sm }}>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <label htmlFor="bmp-make" style={labelStyle}>
          Marque<span style={{ color: "var(--ct-accent-strong)", marginLeft: SPACING.hair }}>*</span>
        </label>
        <Combobox
          value={make}
          options={brandOptions}
          placeholder="Choisir une marque"
          onChange={onBrandChange}
        />
        <input type="hidden" name="make" value={make} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <label htmlFor="bmp-model" style={labelStyle}>
          Modèle<span style={{ color: "var(--ct-accent-strong)", marginLeft: SPACING.hair }}>*</span>
        </label>
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
