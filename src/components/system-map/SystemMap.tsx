"use client";

import "./system-map.css";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--ct-text-faint)",
          fontSize: 13,
        }}
      >
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div className="ct-seg-track" role="tablist" aria-label="Vue de la cartographie">
          <button
            type="button"
            role="tab"
            aria-selected={view === "architecture"}
            className={`ct-seg-btn${view === "architecture" ? " active" : ""}`}
            onClick={() => switchView("architecture")}
          >
            Architecture plateforme
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "agents"}
            className={`ct-seg-btn${view === "agents" ? " active" : ""}`}
            onClick={() => switchView("agents")}
          >
            Agents Automobile
          </button>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {LEGEND.map((l) => (
            <span
              key={l.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "var(--ct-text-muted)",
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Caption contextuelle */}
      <p style={{ fontSize: 12, color: "var(--ct-text-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
        {view === "architecture"
          ? "Flux réel : browser → Next.js (BFF) → Supabase auth / owner_id → FastAPI engine → CrewAI run → persistence Supabase (swarm_runs → swarm_run_steps) → rapport → dashboard Automobile. Clique un nœud pour le détail."
          : "Pipeline du template Automobile alimenté par le dernier run réel. Liaisons : « Transmission via contexte de task / output précédent » — le handoff n'est pas sérialisé en DB. Clique un nœud pour le détail."}
        {data.loadError ? (
          <span style={{ color: "var(--ct-accent-strong)" }}>
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
