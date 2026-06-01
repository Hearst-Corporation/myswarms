"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SwarmRun } from "@/lib/forms/swarmSchemas";
import { extractRecommendation, type Recommendation } from "@/lib/swarms/recommendation";
import { RecommendationBadge } from "@/components/swarms/RecommendationBadge";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { BrandLogo } from "@/components/automobile/BrandLogo";
import { DecisionBadge } from "@/components/automobile/DecisionBadge";
import { getVehicleLabel } from "@/lib/automobile/vehicleLabel";
import { getSourceName } from "@/lib/automobile/source";
import {
  VEHICLE_DECISION_STATUSES,
  decisionLabel,
  type VehicleDecisionStatus,
} from "@/lib/automobile/decisionStatus";
import { formatDate, fmtPrice, fmtKm } from "@/lib/utils/format";
import { thStyle, tdStyle } from "@/lib/ui/tableStyles";
import { FONT, FONT_WEIGHT, RADIUS, SPACING, LETTER_SPACING } from "@/lib/ui/tokens";

// ── Helpers purs ────────────────────────────────────────────────────────────

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function durationMs(run: SwarmRun): number | null {
  if (!run.started_at || !run.finished_at) return null;
  return new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

// ── Vue dérivée d'un run (calculée une fois) ──────────────────────────────────

interface RunView {
  run: SwarmRun;
  rec: Recommendation;
  decision: VehicleDecisionStatus | null;
  label: string;
  make: string;
  fuel: string | null;
  country: string | null;
  source: string | null;
  price: number | null;
  mileage: number | null;
  tokens: number;
  startedMs: number;
  search: string;
}

const SORT_OPTIONS = [
  { value: "date_desc", label: "Plus récent" },
  { value: "date_asc", label: "Plus ancien" },
  { value: "price_desc", label: "Prix ↓" },
  { value: "price_asc", label: "Prix ↑" },
  { value: "mileage_asc", label: "Km ↑" },
  { value: "mileage_desc", label: "Km ↓" },
  { value: "tokens_desc", label: "Tokens ↓" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const REC_OPTIONS: Array<{ value: "" | Recommendation; label: string }> = [
  { value: "", label: "Toutes recommandations" },
  { value: "APPELER", label: "APPELER" },
  { value: "ATTENDRE", label: "ATTENDRE" },
  { value: "ÉVITER", label: "ÉVITER" },
  { value: "UNKNOWN", label: "UNKNOWN" },
];

const selectStyle: React.CSSProperties = {
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.sm,
  fontFamily: "inherit",
  appearance: "none",
  cursor: "pointer",
  boxSizing: "border-box",
};

const inputStyle: React.CSSProperties = {
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.sm,
  fontFamily: "inherit",
  boxSizing: "border-box",
  width: "100%",
};

// ── Composant ─────────────────────────────────────────────────────────────────

export function HistoriqueExplorer({
  runs,
  initialRec = "",
  decisions = {},
}: {
  runs: SwarmRun[];
  initialRec?: string;
  decisions?: Record<string, VehicleDecisionStatus>;
}) {
  const [q, setQ] = useState("");
  const [rec, setRec] = useState<string>(initialRec);
  const [decision, setDecision] = useState("");
  const [status, setStatus] = useState("");
  const [country, setCountry] = useState("");
  const [fuel, setFuel] = useState("");
  const [source, setSource] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sort, setSort] = useState<SortValue>("date_desc");

  // Vues dérivées (memoïsées sur runs)
  const views = useMemo<RunView[]>(
    () =>
      runs.map((run) => {
        const inp = run.inputs_json ?? {};
        const make = asText(inp.make) ?? "";
        const label = getVehicleLabel(inp);
        const sourceUrl = asText(inp.source_url);
        const source = getSourceName(sourceUrl);
        const fuel = asText(inp.fuel);
        const country = asText(inp.country);
        const notes = asText(inp.notes);
        return {
          run,
          rec: extractRecommendation(run.result_text),
          decision: decisions[run.id] ?? null,
          label,
          make,
          fuel,
          country,
          source,
          price: asNumber(inp.price_eur),
          mileage: asNumber(inp.mileage_km),
          tokens: run.total_tokens_in + run.total_tokens_out,
          startedMs: new Date(run.started_at).getTime(),
          search: [label, make, asText(inp.model), source, sourceUrl, country, fuel, notes]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        };
      }),
    [runs, decisions],
  );

  // Listes d'options dérivées des données (évite les options vides)
  const distinct = useMemo(() => {
    const statuses = new Set<string>();
    const countries = new Set<string>();
    const fuels = new Set<string>();
    const sources = new Set<string>();
    for (const v of views) {
      statuses.add(v.run.status);
      if (v.country) countries.add(v.country);
      if (v.fuel) fuels.add(v.fuel);
      if (v.source) sources.add(v.source);
    }
    const sortFr = (a: string, b: string) => a.localeCompare(b, "fr");
    return {
      statuses: [...statuses].sort(sortFr),
      countries: [...countries].sort(sortFr),
      fuels: [...fuels].sort(sortFr),
      sources: [...sources].sort(sortFr),
    };
  }, [views]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const min = priceMin.trim() ? Number(priceMin) : null;
    const max = priceMax.trim() ? Number(priceMax) : null;

    const result = views.filter((v) => {
      if (needle && !v.search.includes(needle)) return false;
      if (rec && v.rec !== rec) return false;
      if (decision && (v.decision ?? "") !== decision) return false;
      if (status && v.run.status !== status) return false;
      if (country && v.country !== country) return false;
      if (fuel && v.fuel !== fuel) return false;
      if (source && v.source !== source) return false;
      if (min != null && Number.isFinite(min) && (v.price == null || v.price < min)) return false;
      if (max != null && Number.isFinite(max) && (v.price == null || v.price > max)) return false;
      return true;
    });

    const byNum = (a: number | null, b: number | null, dir: 1 | -1) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1; // valeurs nulles en fin de liste
      if (b == null) return -1;
      return (a - b) * dir;
    };

    const sorted = [...result];
    switch (sort) {
      case "date_asc":
        sorted.sort((a, b) => a.startedMs - b.startedMs);
        break;
      case "price_desc":
        sorted.sort((a, b) => byNum(a.price, b.price, -1));
        break;
      case "price_asc":
        sorted.sort((a, b) => byNum(a.price, b.price, 1));
        break;
      case "mileage_asc":
        sorted.sort((a, b) => byNum(a.mileage, b.mileage, 1));
        break;
      case "mileage_desc":
        sorted.sort((a, b) => byNum(a.mileage, b.mileage, -1));
        break;
      case "tokens_desc":
        sorted.sort((a, b) => b.tokens - a.tokens);
        break;
      case "date_desc":
      default:
        sorted.sort((a, b) => b.startedMs - a.startedMs);
        break;
    }
    return sorted;
  }, [views, q, rec, decision, status, country, fuel, source, priceMin, priceMax, sort]);

  const hasActiveFilter =
    q.trim() !== "" ||
    rec !== "" ||
    decision !== "" ||
    status !== "" ||
    country !== "" ||
    fuel !== "" ||
    source !== "" ||
    priceMin.trim() !== "" ||
    priceMax.trim() !== "";

  function reset() {
    setQ("");
    setRec("");
    setDecision("");
    setStatus("");
    setCountry("");
    setFuel("");
    setSource("");
    setPriceMin("");
    setPriceMax("");
    setSort("date_desc");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}>
      {/* Barre de filtres */}
      <div
        className="ct-card"
        style={{
          padding: `${SPACING.lg}px`,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: SPACING.md,
          alignItems: "end",
        }}
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher : marque, modèle, source, URL, notes…"
            style={inputStyle}
          />
        </div>

        <select value={rec} onChange={(e) => setRec(e.target.value)} style={selectStyle}>
          {REC_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select value={decision} onChange={(e) => setDecision(e.target.value)} style={selectStyle}>
          <option value="">Toutes décisions</option>
          {VEHICLE_DECISION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {decisionLabel(s.value)}
            </option>
          ))}
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="">Tous statuts</option>
          {distinct.statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select value={country} onChange={(e) => setCountry(e.target.value)} style={selectStyle}>
          <option value="">Tous pays</option>
          {distinct.countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select value={fuel} onChange={(e) => setFuel(e.target.value)} style={selectStyle}>
          <option value="">Tous carburants</option>
          {distinct.fuels.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <select value={source} onChange={(e) => setSource(e.target.value)} style={selectStyle}>
          <option value="">Toutes sources</option>
          {distinct.sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <input
          type="number"
          value={priceMin}
          onChange={(e) => setPriceMin(e.target.value)}
          placeholder="Prix min €"
          min={0}
          style={inputStyle}
        />
        <input
          type="number"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value)}
          placeholder="Prix max €"
          min={0}
          style={inputStyle}
        />

        <select value={sort} onChange={(e) => setSort(e.target.value as SortValue)} style={selectStyle}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              Tri : {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Compteur + reset */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: SPACING.md,
        }}
      >
        <span
          style={{
            fontSize: FONT.xs,
            fontWeight: FONT_WEIGHT.bold,
            letterSpacing: LETTER_SPACING.wide,
            textTransform: "uppercase",
            color: "var(--ct-text-muted)",
          }}
        >
          {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
          {filtered.length !== views.length ? ` sur ${views.length}` : ""}
        </span>
        {hasActiveFilter ? (
          <button type="button" onClick={reset} className="ct-link" style={{ fontSize: FONT.xs }}>
            Réinitialiser les filtres
          </button>
        ) : null}
      </div>

      {/* Tableau */}
      {filtered.length === 0 ? (
        <div className="ct-card" style={{ textAlign: "center", padding: `${SPACING.xxl}px` }}>
          <div className="ct-card-title" style={{ marginBottom: SPACING.sm }}>
            Aucune analyse ne correspond
          </div>
          <p className="ct-card-body">Ajuste ou réinitialise les filtres.</p>
        </div>
      ) : (
        <div className="ct-card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FONT.sm }}>
            <thead>
              <tr>
                <th style={thStyle}>Véhicule</th>
                <th style={thStyle}>Recommandation</th>
                <th style={thStyle}>Décision</th>
                <th style={thStyle}>Prix / KM</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Statut</th>
                <th style={thStyle}>Tokens</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Durée</th>
                <th style={{ ...thStyle, textAlign: "right" }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const dur = durationMs(v.run);
                return (
                  <tr key={v.run.id}>
                    <td style={{ ...tdStyle, minWidth: 220 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
                        <BrandLogo brand={v.make} size={32} />
                        <div>
                          <div
                            style={{
                              fontWeight: FONT_WEIGHT.semibold,
                              color: "var(--ct-text-primary)",
                            }}
                          >
                            {v.label}
                          </div>
                          <div style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>
                            {[v.fuel, v.country].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <RecommendationBadge rec={v.rec} />
                    </td>
                    <td style={tdStyle}>
                      {v.decision ? (
                        <DecisionBadge status={v.decision} />
                      ) : (
                        <span style={{ color: "var(--ct-text-faint)" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <strong style={{ color: "var(--ct-text-primary)" }}>{fmtPrice(v.price)}</strong>
                      <div style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>
                        {fmtKm(v.mileage)}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>{v.source ?? "—"}</td>
                    <td style={tdStyle}>
                      <StatusBadge status={v.run.status} />
                    </td>
                    <td style={{ ...tdStyle, color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>
                      {v.tokens.toLocaleString("fr-FR")}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--ct-text-muted)", whiteSpace: "nowrap" }}>
                      {formatDate(v.run.started_at)}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--ct-text-muted)" }}>
                      {dur ? fmtDuration(dur) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <Link
                        href={`/automobile/${v.run.id}`}
                        className="ct-link"
                        style={{ fontSize: FONT.xs, whiteSpace: "nowrap" }}
                      >
                        Voir →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
