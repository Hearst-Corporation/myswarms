"use client";

import { useState } from "react";
import Link from "next/link";
import {
  decisionLabel,
  isDecisionOpen,
  isVehicleDecisionStatus,
  type VehicleDecisionStatus,
} from "@/lib/automobile/decisionStatus";
import type { Recommendation } from "@/lib/swarms/recommendation";
import { fmtKm, fmtPrice, formatDate } from "@/lib/utils/format";
import { FONT, FONT_WEIGHT, SPACING, RADIUS } from "@/lib/ui/tokens";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DecisionCanvasProps {
  run: {
    id: string;
    status: string;
    inputs_json: Record<string, unknown>;
    result_text?: string | null;
    total_tokens_in: number;
    total_tokens_out: number;
    started_at: string;
    finished_at?: string | null;
    steps: Array<{
      agent_name?: string | null;
      task_name?: string | null;
      status: string;
      tokens_in: number;
      tokens_out: number;
      output_text?: string | null;
    }>;
    source_url?: string | null;
  } | null;
  decision: string | null;
  recommendation: Recommendation;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function asText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tk`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k tk`;
  return `${n} tk`;
}

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function countInputFields(inputs: Record<string, unknown>): number {
  const SKIP = new Set(["source_url", "image_url"]);
  return Object.entries(inputs).filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined && v !== "").length;
}

type RunStep = {
  agent_name?: string | null;
  task_name?: string | null;
  status: string;
  tokens_in: number;
  tokens_out: number;
  output_text?: string | null;
};

function findStep(
  steps: RunStep[],
  matcher: (s: RunStep) => boolean,
): RunStep | undefined {
  return steps.find(matcher);
}

// ─── Node visual state ────────────────────────────────────────────────────────

type NodeState = "completed" | "running" | "failed" | "pending";

const STATE_COLORS: Record<NodeState, { border: string; dot: string }> = {
  completed: { border: "#22c55e", dot: "#22c55e" },
  running: { border: "#f59e0b", dot: "#f59e0b" },
  failed: { border: "var(--ct-alert-error-text, #ef4444)", dot: "var(--ct-alert-error-text, #ef4444)" },
  pending: { border: "var(--ct-border-soft, #334155)", dot: "var(--ct-text-faint, #64748b)" },
};

function statusToState(status: string | undefined): NodeState {
  if (!status) return "pending";
  if (status === "completed") return "completed";
  if (status === "running" || status === "paused_hitl") return "running";
  if (status === "failed" || status === "cancelled") return "failed";
  return "pending";
}

function recToState(rec: Recommendation): NodeState {
  if (rec === "APPELER") return "completed";
  if (rec === "ATTENDRE") return "running";
  if (rec === "ÉVITER") return "failed";
  return "pending";
}

// ─── Recommendation colors ────────────────────────────────────────────────────

const REC_COLORS: Record<Recommendation, string> = {
  APPELER: "#22c55e",
  ATTENDRE: "#f59e0b",
  "ÉVITER": "#ef4444",
  UNKNOWN: "var(--ct-text-faint, #64748b)",
};

// ─── Node definitions (data, not SVG) ────────────────────────────────────────

interface NodeDef {
  id: string;
  label: string;
  subtitle: string;
  state: NodeState;
  detail: Record<string, string | null | undefined>;
  href?: string;
}

// ─── SVG constants ────────────────────────────────────────────────────────────

const VB_W = 700;
const NODE_W = 320;
const NODE_H = 56;
const NODE_X = (VB_W - NODE_W) / 2; // centered = 190
const START_Y = 48;
const STEP_Y = 90;
const ARROW_H = 12;
const NODE_COUNT = 9;
const VB_H = START_Y + (NODE_COUNT - 1) * STEP_Y + NODE_H + 48;

// ─── SVG Node ────────────────────────────────────────────────────────────────

function SvgNode({
  label,
  subtitle,
  state,
  x,
  y,
  hovered,
  onHover,
  onLeave,
  href,
  recColor,
}: {
  label: string;
  subtitle: string;
  state: NodeState;
  x: number;
  y: number;
  hovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  href?: string;
  recColor?: string;
}) {
  const { border, dot } = STATE_COLORS[state];
  const bg = hovered ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.03)";
  const borderColor = recColor ?? border;

  const inner = (
    <g
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{ cursor: href ? "pointer" : "default" }}
    >
      {/* Card background */}
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={8}
        ry={8}
        fill={bg}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={1}
      />
      {/* Left accent bar */}
      <rect
        x={x}
        y={y + 8}
        width={3}
        height={NODE_H - 16}
        rx={2}
        ry={2}
        fill={borderColor}
      />
      {/* State dot */}
      <circle
        cx={x + NODE_W - 16}
        cy={y + NODE_H / 2}
        r={4}
        fill={dot}
        opacity={0.9}
      />
      {/* Label */}
      <text
        x={x + 18}
        y={y + 20}
        fontSize={13}
        fontWeight={600}
        fill="rgba(255,255,255,0.9)"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {label}
      </text>
      {/* Subtitle */}
      <text
        x={x + 18}
        y={y + 38}
        fontSize={11}
        fontWeight={400}
        fill="rgba(255,255,255,0.45)"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {subtitle.length > 46 ? subtitle.slice(0, 43) + "…" : subtitle}
      </text>
    </g>
  );

  if (href) {
    return <a href={href}>{inner}</a>;
  }
  return inner;
}

// ─── Connector (vertical line + arrowhead) ────────────────────────────────────

function Connector({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  const midX = x;
  const arrowY = y2 - ARROW_H;
  return (
    <g>
      <line
        x1={midX}
        y1={y1}
        x2={midX}
        y2={arrowY}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <polygon
        points={`${midX - 5},${arrowY} ${midX + 5},${arrowY} ${midX},${y2}`}
        fill="rgba(255,255,255,0.2)"
      />
    </g>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ node }: { node: NodeDef }) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.96)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: RADIUS.lg,
        padding: `${SPACING.lg}px`,
        minWidth: 240,
        maxWidth: 360,
        backdropFilter: "blur(12px)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: FONT.md,
          fontWeight: FONT_WEIGHT.semibold,
          color: "rgba(255,255,255,0.9)",
          marginBottom: SPACING.sm,
        }}
      >
        {node.label}
      </div>
      <div
        style={{
          fontSize: FONT.sm,
          color: "rgba(255,255,255,0.4)",
          marginBottom: SPACING.md,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {node.state}
      </div>
      {Object.entries(node.detail).map(([k, v]) =>
        v != null ? (
          <div
            key={k}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              marginBottom: SPACING.sm,
              paddingBottom: SPACING.sm,
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span
              style={{
                fontSize: FONT.xs,
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {k}
            </span>
            <span
              style={{
                fontSize: FONT.sm,
                color: "rgba(255,255,255,0.75)",
                wordBreak: "break-word",
              }}
            >
              {v.length > 300 ? v.slice(0, 297) + "…" : v}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DecisionCanvas({ run, decision, recommendation }: DecisionCanvasProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // ── Empty state ──
  if (!run) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 320,
          gap: SPACING.xl,
          color: "rgba(255,255,255,0.4)",
          fontSize: FONT.md,
        }}
      >
        <span>Aucune analyse disponible</span>
        <Link
          href="/automobile/nouvelle"
          style={{
            color: "var(--ct-accent-strong, #6366f1)",
            fontSize: FONT.sm,
            textDecoration: "underline",
          }}
        >
          Lancer une nouvelle analyse →
        </Link>
      </div>
    );
  }

  // ── Build node data ──
  const inputs = run.inputs_json ?? {};
  const sourceUrl = asText(inputs.source_url as unknown) ?? run.source_url ?? null;
  const hostname = hostnameOf(sourceUrl);
  const fieldCount = countInputFields(inputs);
  const totalTokens = run.total_tokens_in + run.total_tokens_out;

  // Find steps by agent name patterns
  const collectorStep = findStep(
    run.steps,
    (s) => !!(s.agent_name?.toLowerCase().includes("collect") || s.agent_name?.toLowerCase().includes("data")),
  ) ?? run.steps[0];

  const riskStep = findStep(
    run.steps,
    (s) => !!(s.agent_name?.toLowerCase().includes("risk") || s.agent_name?.toLowerCase().includes("analyst")),
  ) ?? run.steps[1];

  const writerStep = findStep(
    run.steps,
    (s) => !!(s.agent_name?.toLowerCase().includes("writer") || s.agent_name?.toLowerCase().includes("decision")),
  ) ?? run.steps[2];

  const price = fmtPrice(typeof inputs.price_eur === "number" ? inputs.price_eur : null);
  const mileage = fmtKm(typeof inputs.mileage_km === "number" ? inputs.mileage_km : null);

  // Decision info
  const decisionStatus: VehicleDecisionStatus | null =
    decision !== null && isVehicleDecisionStatus(decision) ? decision : null;
  const decisionOpen = decisionStatus ? isDecisionOpen(decisionStatus) : true;
  const decisionLabelStr = decisionStatus ? decisionLabel(decisionStatus) : "À décider";

  const nodes: NodeDef[] = [
    {
      id: "source",
      label: "Source",
      subtitle: hostname ?? "Saisie manuelle",
      state: "completed",
      detail: {
        URL: sourceUrl,
        Hostname: hostname,
        "Saisie": hostname ? null : "Formulaire manuel",
      },
    },
    {
      id: "prefill",
      label: "Extraction URL",
      subtitle: `${fieldCount} champ${fieldCount !== 1 ? "s" : ""} extraits`,
      state: fieldCount > 0 ? "completed" : "pending",
      detail: {
        "Champs extraits": `${fieldCount}`,
        Marque: asText(inputs.make as unknown),
        Modèle: asText(inputs.model as unknown),
        Prix: price !== "—" ? price : null,
        Kilométrage: mileage !== "—" ? mileage : null,
        Carburant: asText(inputs.fuel as unknown),
        Année: inputs.year != null ? String(inputs.year) : null,
        Pays: asText(inputs.country as unknown),
      },
    },
    {
      id: "swarm",
      label: "Automobile — Recherche véhicule",
      subtitle: `${run.status} · ${fmtTokens(totalTokens)}`,
      state: statusToState(run.status),
      detail: {
        "Run ID": run.id,
        Statut: run.status,
        Démarré: formatDate(run.started_at),
        Terminé: formatDate(run.finished_at),
        "Tokens in": run.total_tokens_in.toLocaleString("fr-FR"),
        "Tokens out": run.total_tokens_out.toLocaleString("fr-FR"),
        "Total tokens": totalTokens.toLocaleString("fr-FR"),
      },
    },
    {
      id: "collector",
      label: "Data Collector",
      subtitle: collectorStep?.status ?? "—",
      state: statusToState(collectorStep?.status),
      detail: {
        Agent: collectorStep?.agent_name,
        Tâche: collectorStep?.task_name,
        Statut: collectorStep?.status,
        "Tokens in": collectorStep?.tokens_in.toLocaleString("fr-FR"),
        "Tokens out": collectorStep?.tokens_out.toLocaleString("fr-FR"),
        Sortie: collectorStep?.output_text?.slice(0, 300),
      },
    },
    {
      id: "risk",
      label: "Risk Analyst",
      subtitle: riskStep?.status ?? "—",
      state: statusToState(riskStep?.status),
      detail: {
        Agent: riskStep?.agent_name,
        Tâche: riskStep?.task_name,
        Statut: riskStep?.status,
        "Tokens in": riskStep?.tokens_in.toLocaleString("fr-FR"),
        "Tokens out": riskStep?.tokens_out.toLocaleString("fr-FR"),
        Sortie: riskStep?.output_text?.slice(0, 300),
      },
    },
    {
      id: "writer",
      label: "Decision Writer",
      subtitle: writerStep?.status ?? "—",
      state: statusToState(writerStep?.status),
      detail: {
        Agent: writerStep?.agent_name,
        Tâche: writerStep?.task_name,
        Statut: writerStep?.status,
        "Tokens in": writerStep?.tokens_in.toLocaleString("fr-FR"),
        "Tokens out": writerStep?.tokens_out.toLocaleString("fr-FR"),
        Sortie: writerStep?.output_text?.slice(0, 300),
      },
    },
    {
      id: "rapport",
      label: "Rapport",
      subtitle: recommendation,
      state: recToState(recommendation),
      detail: {
        Recommandation: recommendation,
        "Run ID": run.id,
        "Résultat (extrait)": run.result_text?.slice(0, 300),
      },
      href: run.id ? `/automobile/${run.id}` : undefined,
    },
    {
      id: "decision",
      label: "Décision humaine",
      subtitle: decisionLabelStr,
      state: decisionOpen ? "running" : "completed",
      detail: {
        Statut: decisionLabelStr,
        "En cours": decisionOpen ? "Oui" : "Non",
        "Mis à jour": "—",
      },
    },
    {
      id: "dashboard",
      label: "Dashboard & Historique",
      subtitle: "Visible dans /automobile",
      state: "completed",
      detail: {
        Lien: "/automobile",
        Historique: "/automobile/historique",
      },
      href: "/automobile",
    },
  ];

  const hoveredNode = hoveredId ? nodes.find((n) => n.id === hoveredId) ?? null : null;

  return (
    <div
      style={{
        display: "flex",
        gap: SPACING.xl,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      {/* SVG Canvas */}
      <div style={{ flex: "1 1 320px", minWidth: 280 }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          style={{
            display: "block",
            background: "rgba(8,12,28,0.92)",
            borderRadius: RADIUS.lg,
            border: "1px solid rgba(255,255,255,0.07)",
          }}
          aria-label="Decision flow canvas"
        >
          {/* Background grid hint */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={VB_W} height={VB_H} fill="url(#grid)" />

          {/* Title */}
          <text
            x={VB_W / 2}
            y={24}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="rgba(255,255,255,0.25)"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="0.12em"
            style={{ textTransform: "uppercase" }}
          >
            AUTOMOBILE · DECISION CANVAS
          </text>

          {/* Connectors (drawn before nodes so they appear beneath) */}
          {nodes.slice(0, -1).map((_, i) => {
            const y1 = START_Y + i * STEP_Y + NODE_H;
            const y2 = START_Y + (i + 1) * STEP_Y;
            return (
              <Connector
                key={i}
                x={NODE_X + NODE_W / 2}
                y1={y1}
                y2={y2}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node, i) => {
            const y = START_Y + i * STEP_Y;
            const isRapport = node.id === "rapport";
            const recColor = isRapport ? REC_COLORS[recommendation] : undefined;
            return (
              <SvgNode
                key={node.id}
                label={node.label}
                subtitle={node.subtitle}
                state={node.state}
                x={NODE_X}
                y={y}
                hovered={hoveredId === node.id}
                onHover={() => setHoveredId(node.id)}
                onLeave={() => setHoveredId(null)}
                href={node.href}
                recColor={recColor}
              />
            );
          })}
        </svg>
      </div>

      {/* Detail panel */}
      <div
        style={{
          flex: "0 0 280px",
          minWidth: 240,
          maxWidth: 360,
          position: "sticky",
          top: SPACING.xxl,
        }}
      >
        {hoveredNode ? (
          <DetailPanel node={hoveredNode} />
        ) : (
          <div
            style={{
              background: "rgba(15,23,42,0.5)",
              border: "1px dashed rgba(255,255,255,0.08)",
              borderRadius: RADIUS.lg,
              padding: `${SPACING.xl}px`,
              textAlign: "center",
              color: "rgba(255,255,255,0.2)",
              fontSize: FONT.sm,
            }}
          >
            Survolez un nœud pour voir les détails
          </div>
        )}

        {/* Quick stats */}
        <div
          style={{
            marginTop: SPACING.lg,
            background: "rgba(15,23,42,0.5)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: RADIUS.lg,
            padding: `${SPACING.lg}px`,
            display: "flex",
            flexDirection: "column",
            gap: SPACING.sm,
          }}
        >
          {[
            { label: "Run ID", value: run.id.slice(0, 8) + "…" },
            { label: "Statut", value: run.status },
            { label: "Recommandation", value: recommendation },
            { label: "Tokens totaux", value: totalTokens.toLocaleString("fr-FR") },
            { label: "Étapes", value: `${run.steps.length}` },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: SPACING.sm,
                paddingBottom: SPACING.xs,
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                fontSize: FONT.sm,
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.35)" }}>{label}</span>
              <span
                style={{
                  color:
                    label === "Recommandation"
                      ? REC_COLORS[recommendation]
                      : "rgba(255,255,255,0.7)",
                  fontWeight: FONT_WEIGHT.medium,
                }}
              >
                {value}
              </span>
            </div>
          ))}
          <Link
            href={`/automobile/${run.id}`}
            style={{
              marginTop: SPACING.xs,
              textAlign: "center",
              fontSize: FONT.sm,
              color: "var(--ct-accent-strong, #6366f1)",
              textDecoration: "none",
              padding: `${SPACING.sm}px`,
              borderRadius: RADIUS.sm,
              border: "1px solid rgba(99,102,241,0.25)",
              display: "block",
            }}
          >
            Ouvrir le rapport →
          </Link>
        </div>
      </div>
    </div>
  );
}
