"use client";

import "./system-map.css";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { cn } from "@/lib/ui/cn";
import { DetailPanel } from "./DetailPanel";
import { buildArchitecture } from "./buildArchitecture";
import { buildAgentGraph } from "./buildAgentGraph";
import { statusColor, kindColor } from "./MapNode";
import type { SystemMapData, MapNodeData } from "./types";

type View = "architecture" | "agents";

const SystemMapCanvas = dynamic(
  () => import("./SystemMapCanvas").then((m) => m.SystemMapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-content-faint">
        Chargement de la cartographie…
      </div>
    ),
  },
);

const LEGEND: { label: string; color: string }[] = [
  { label: "completed", color: statusColor("completed") },
  { label: "running", color: statusColor("running") },
  { label: "failed", color: statusColor("failed") },
  { label: "template", color: kindColor("template") },
  { label: "data / table", color: kindColor("table") },
];

const TAB_BTN =
  "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors";

export function SystemMap({ data }: { data: SystemMapData }) {
  const [view, setView] = useState<View>("architecture");
  const [selected, setSelected] = useState<MapNodeData | null>(null);

  const arch = useMemo(() => buildArchitecture(data.run), [data.run]);
  const agents = useMemo(() => buildAgentGraph(data), [data]);
  const graph = view === "architecture" ? arch : agents;

  function switchView(v: View) {
    setView(v);
    setSelected(null);
  }

  return (
    <div className="sm-shell">
      {/* Onglets de vue + légende */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex gap-1 rounded-[var(--radius-md)] bg-surface-2 p-1 ring-1 ring-inset ring-line"
          role="tablist"
          aria-label="Vue de la cartographie"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "architecture"}
            className={cn(
              TAB_BTN,
              view === "architecture"
                ? "bg-surface text-content-strong ring-1 ring-inset ring-line"
                : "text-content-muted hover:text-content",
            )}
            onClick={() => switchView("architecture")}
          >
            Architecture plateforme
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "agents"}
            className={cn(
              TAB_BTN,
              view === "agents"
                ? "bg-surface text-content-strong ring-1 ring-inset ring-line"
                : "text-content-muted hover:text-content",
            )}
            onClick={() => switchView("agents")}
          >
            Agents Automobile
          </button>
        </div>

        <div className="flex flex-wrap gap-4">
          {LEGEND.map((l) => (
            <span
              key={l.label}
              className="inline-flex items-center gap-1 text-[10px] text-content-muted"
            >
              <span className="size-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Caption contextuelle */}
      <p className="mb-3 text-sm leading-snug text-content-muted">
        {view === "architecture"
          ? "Flux réel : browser → Next.js (BFF) → Supabase auth / owner_id → FastAPI engine → CrewAI run → persistence Supabase (swarm_runs → swarm_run_steps) → rapport → dashboard Automobile. Clique un nœud pour le détail."
          : "Pipeline du template Automobile alimenté par le dernier run réel. Liaisons : « Transmission via contexte de task / output précédent » — le handoff n'est pas sérialisé en DB. Clique un nœud pour le détail."}
        {data.loadError ? (
          <span className="text-accent">
            {" "}· Données template indisponibles ({data.loadError}) — vue agents dégradée.
          </span>
        ) : null}
      </p>

      {/* Canvas 2D */}
      <div className="sm-canvas">
        <SystemMapCanvas
          nodes={graph.nodes}
          edges={graph.edges}
          viewKey={view}
          onSelect={setSelected}
          onClear={() => setSelected(null)}
        />
        {selected ? <DetailPanel data={selected} onClose={() => setSelected(null)} /> : null}
      </div>
    </div>
  );
}
