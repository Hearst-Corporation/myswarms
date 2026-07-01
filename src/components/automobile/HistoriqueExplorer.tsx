"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SwarmRun } from "@/lib/forms/swarmSchemas";
import { extractRecommendation, type Recommendation } from "@/lib/swarms/recommendation";
import { RecommendationBadge } from "@/components/swarms/RecommendationBadge";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { BrandLogo } from "@/components/automobile/BrandLogo";
import { DecisionBadge } from "@/components/automobile/DecisionBadge";
import { Card, CardBody, Input, Select, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { getVehicleLabel } from "@/lib/automobile/vehicleLabel";
import { getSourceName } from "@/lib/automobile/source";
import {
  VEHICLE_DECISION_STATUSES,
  decisionLabel,
  type VehicleDecisionStatus,
} from "@/lib/automobile/decisionStatus";
import { formatDate, fmtPrice, fmtKm } from "@/lib/utils/format";

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
    <div className="flex flex-col gap-6">
      {/* Barre de filtres */}
      <Card>
        <CardBody className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end gap-4">
          <div className="col-span-full">
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher : marque, modèle, source, URL, notes…"
            />
          </div>

          <Select value={rec} onChange={(e) => setRec(e.target.value)}>
            {REC_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="">Toutes décisions</option>
            {VEHICLE_DECISION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {decisionLabel(s.value)}
              </option>
            ))}
          </Select>

          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            {distinct.statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>

          <Select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Tous pays</option>
            {distinct.countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Select value={fuel} onChange={(e) => setFuel(e.target.value)}>
            <option value="">Tous carburants</option>
            {distinct.fuels.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>

          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Toutes sources</option>
            {distinct.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>

          <Input
            type="number"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="Prix min €"
            min={0}
          />
          <Input
            type="number"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="Prix max €"
            min={0}
          />

          <Select value={sort} onChange={(e) => setSort(e.target.value as SortValue)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Tri : {o.label}
              </option>
            ))}
          </Select>
        </CardBody>
      </Card>

      {/* Compteur + reset */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-bold uppercase tracking-wider text-content-muted">
          {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
          {filtered.length !== views.length ? ` sur ${views.length}` : ""}
        </span>
        {hasActiveFilter ? (
          <button
            type="button"
            onClick={reset}
            className="text-xs font-medium text-accent hover:text-accent-strong"
          >
            Réinitialiser les filtres
          </button>
        ) : null}
      </div>

      {/* Tableau */}
      {filtered.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <h3 className="mb-2 text-sm font-semibold text-content-strong">
              Aucune analyse ne correspond
            </h3>
            <p className="text-sm text-content-muted">Ajuste ou réinitialise les filtres.</p>
          </CardBody>
        </Card>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Véhicule</TH>
              <TH>Recommandation</TH>
              <TH>Décision</TH>
              <TH>Prix / KM</TH>
              <TH>Source</TH>
              <TH>Statut</TH>
              <TH>Tokens</TH>
              <TH>Date</TH>
              <TH>Durée</TH>
              <TH className="text-right" />
            </TR>
          </THead>
          <TBody>
            {filtered.map((v) => {
              const dur = durationMs(v.run);
              return (
                <TR key={v.run.id}>
                  <TD className="min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <BrandLogo brand={v.make} size={32} />
                      <div>
                        <div className="font-semibold text-content-strong">{v.label}</div>
                        <div className="text-xs text-content-faint">
                          {[v.fuel, v.country].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <RecommendationBadge rec={v.rec} />
                  </TD>
                  <TD>
                    {v.decision ? (
                      <DecisionBadge status={v.decision} />
                    ) : (
                      <span className="text-content-faint">—</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap">
                    <strong className="text-content-strong">{fmtPrice(v.price)}</strong>
                    <div className="text-xs text-content-faint">{fmtKm(v.mileage)}</div>
                  </TD>
                  <TD className="text-content-muted">{v.source ?? "—"}</TD>
                  <TD>
                    <StatusBadge status={v.run.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-content-muted">
                    {v.tokens.toLocaleString("fr-FR")}
                  </TD>
                  <TD className="whitespace-nowrap text-content-muted">
                    {formatDate(v.run.started_at)}
                  </TD>
                  <TD className="text-content-muted">{dur ? fmtDuration(dur) : "—"}</TD>
                  <TD className="text-right">
                    <Link
                      href={`/automobile/${v.run.id}`}
                      className="whitespace-nowrap text-xs font-medium text-accent hover:text-accent-strong"
                    >
                      Voir →
                    </Link>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
