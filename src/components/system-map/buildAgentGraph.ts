import type {
  MapNode,
  MapEdge,
  SystemMapData,
  PanelDetail,
  AgentSlot,
  RunInfo,
} from "./types";
import { mkNode, mkEdge } from "./graph";

const ACCENT = "var(--ct-accent-strong)";
const HANDOFF = "Transmission via contexte de task / output précédent";

const AGENT_X = [280, 560, 840, 1120, 1400];
const PIPELINE_Y = 130;

/**
 * Vue B — schéma dynamique du template Automobile, alimenté par les VRAIES
 * données du dernier run (statuts, outputs, inputs, recommandation).
 */
export function buildAgentGraph(data: SystemMapData): {
  nodes: MapNode[];
  edges: MapEdge[];
} {
  const run = data.run;
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  // Bandeau "dernier run" (au-dessus du pipeline)
  if (run) {
    nodes.push(
      mkNode("run", 280, -50, {
        label: `Run ${run.id.slice(0, 8)}…`,
        kind: "report",
        status: runStatusToMap(run.status),
        sub: `${run.status} · ${run.steps} steps · ${(
          run.tokensIn + run.tokensOut
        ).toLocaleString("en-US")} tok`,
        desc: `recommandation : ${run.recommendation === "UNKNOWN" ? "—" : run.recommendation}`,
        detail: runDetail(data, run),
      }),
    );
  }

  // Input utilisateur (valeurs réelles)
  nodes.push(
    mkNode("input", 0, PIPELINE_Y, {
      label: "Input utilisateur",
      kind: "input",
      status: "static",
      sub: data.inputFields.length ? `${data.inputFields.length} champs` : "aucun run",
      desc:
        data.inputFields
          .slice(0, 3)
          .map((f) => f.value)
          .join(" · ") || undefined,
      detail: inputDetail(data),
    }),
  );

  // Agents (statut + extrait output réels)
  data.agents.forEach((a, i) => {
    nodes.push(
      mkNode(`agent-${i}`, AGENT_X[i] ?? 280 + i * 280, PIPELINE_Y, {
        label: a.name,
        kind: "agent",
        status: a.status,
        sub: `${a.role} · ${prettyModel(a.model)}`,
        desc: a.outputExcerpt ? truncate(a.outputExcerpt, 64) : a.taskName ?? undefined,
        detail: agentDetail(a),
      }),
    );
  });

  // Rapport final
  const reportX = AGENT_X[data.agents.length] ?? 280 + data.agents.length * 280;
  nodes.push(
    mkNode("report", reportX, PIPELINE_Y, {
      label: "Rapport final",
      kind: "report",
      status: run?.status === "completed" ? "report" : "static",
      sub: run ? (run.recommendation === "UNKNOWN" ? "—" : run.recommendation) : "en attente",
      desc: data.reportExcerpt ? truncate(data.reportExcerpt, 64) : undefined,
      detail: reportDetail(data, run),
    }),
  );

  // Liaisons (handoff honnête, jamais sérialisé en DB)
  if (data.agents.length > 0) {
    edges.push(mkEdge("a-in", "input", "agent-0", { label: HANDOFF, color: ACCENT, animated: true }));
    for (let i = 0; i < data.agents.length - 1; i++) {
      edges.push(
        mkEdge(`a-${i}`, `agent-${i}`, `agent-${i + 1}`, {
          label: HANDOFF,
          color: ACCENT,
          animated: true,
        }),
      );
    }
    edges.push(
      mkEdge("a-out", `agent-${data.agents.length - 1}`, "report", {
        label: HANDOFF,
        color: ACCENT,
        animated: true,
      }),
    );
  } else {
    edges.push(mkEdge("a-empty", "input", "report", { label: HANDOFF, color: ACCENT }));
  }

  if (run) {
    edges.push(mkEdge("a-run", "run", "input", { dashed: true, label: "alimente", color: ACCENT }));
  }

  return { nodes, edges };
}

// ── Détails (panneau) ───────────────────────────────────────────────────────

function agentDetail(a: AgentSlot): PanelDetail {
  return {
    title: a.name,
    rows: [
      { label: "Rôle", value: a.role },
      { label: "Modèle", value: `${a.provider}/${a.model}` },
      { label: "Statut", value: a.statusRaw },
      ...(a.taskName ? [{ label: "Task", value: a.taskName }] : []),
      ...(a.tokens ? [{ label: "Tokens", value: a.tokens.toLocaleString("en-US") }] : []),
      ...(a.objective ? [{ label: "Objectif", value: truncate(a.objective, 200) }] : []),
    ],
    body: a.outputExcerpt ?? undefined,
    bodyLabel: a.outputExcerpt ? "Dernier output" : undefined,
  };
}

function inputDetail(data: SystemMapData): PanelDetail {
  return {
    title: "Input utilisateur",
    rows: data.inputFields.length
      ? data.inputFields.map((f) => ({ label: f.label, value: f.value }))
      : [{ label: "État", value: "Aucun run — lance une recherche" }],
  };
}

function reportDetail(data: SystemMapData, run: RunInfo | null): PanelDetail {
  const links = run
    ? [
        { label: "Ouvrir le run", href: `/swarms/${data.swarmId}/runs/${run.id}` },
        { label: "Voir le template", href: `/swarms/${data.swarmId}` },
        { label: "Dashboard Automobile", href: "/automobile" },
      ]
    : [{ label: "Voir le template", href: `/swarms/${data.swarmId}` }];
  return {
    title: "Rapport final",
    rows: [
      { label: "Recommandation", value: run ? (run.recommendation === "UNKNOWN" ? "—" : run.recommendation) : "—" },
      { label: "Statut", value: run?.status ?? "aucun run" },
    ],
    body: data.reportExcerpt ?? undefined,
    bodyLabel: data.reportExcerpt ? "Extrait du rapport" : undefined,
    links,
  };
}

function runDetail(data: SystemMapData, run: RunInfo): PanelDetail {
  return {
    title: `Run ${run.id.slice(0, 8)}…`,
    rows: [
      { label: "Run id", value: run.id },
      { label: "Statut", value: run.status },
      { label: "Démarré", value: run.startedAt },
      { label: "Terminé", value: run.finishedAt ?? "—" },
      { label: "Tokens", value: `${run.tokensIn.toLocaleString("en-US")} in · ${run.tokensOut.toLocaleString("en-US")} out` },
      { label: "Steps", value: String(run.steps) },
      { label: "Recommandation", value: run.recommendation === "UNKNOWN" ? "—" : run.recommendation },
    ],
    links: [{ label: "Ouvrir le run", href: `/swarms/${data.swarmId}/runs/${run.id}` }],
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function runStatusToMap(status: string) {
  if (status === "completed") return "completed" as const;
  if (status === "failed" || status === "cancelled") return "failed" as const;
  if (status === "running" || status === "paused_hitl" || status === "pending")
    return "running" as const;
  return "static" as const;
}

function prettyModel(model: string): string {
  if (!model || model === "—") return model || "—";
  return model
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}
