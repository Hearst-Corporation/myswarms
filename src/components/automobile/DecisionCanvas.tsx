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
import { FONT, FONT_WEIGHT, SPACING, RADIUS, COLOR, SIZE, BLUR, LETTER_SPACING } from "@/lib/ui/tokens";

// ─── Constantes de troncature (magic numbers extraits) ─────────────────────────
const SUBTITLE_MAX_LEN = 46;
const SUBTITLE_TRUNC = 43;
const DETAIL_VALUE_MAX_LEN = 300;
const DETAIL_VALUE_TRUNC = 297;
const STEP_OUTPUT_PREVIEW = 300;
const RESULT_PREVIEW = 300;
const RUN_ID_SHORT = 8;

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
  completed: { border: COLOR.statusCompleted, dot: COLOR.statusCompleted },
  running: { border: COLOR.statusPaused, dot: COLOR.statusPaused },
  failed: { border: COLOR.statusFailed, dot: COLOR.statusFailed },
  pending: { border: COLOR.borderSoft, dot: COLOR.textFaint },
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
  APPELER: COLOR.statusCompleted,
  ATTENDRE: COLOR.statusPaused,
  "ÉVITER": COLOR.statusFailed,
  UNKNOWN: COLOR.textFaint,
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

// Géométrie SVG (coordonnées dans un viewBox fixe — pas du spacing CSS).
const VB_W = 700;
const NODE_W = 320;
const NODE_H = 56;
const NODE_X = (VB_W - NODE_W) / 2; // centered = 190
const START_Y = 48;
const STEP_Y = 90;
const ARROW_H = 12;
const NODE_COUNT = 9;
const VB_BOTTOM_PAD = 48;
const VB_H = START_Y + (NODE_COUNT - 1) * STEP_Y + NODE_H + VB_BOTTOM_PAD;
const ACCENT_BAR_W = 3;
const DOT_R = 4;
const TEXT_PAD_X = 18;
const LABEL_BASELINE_Y = 20;
const SUBTITLE_BASELINE_Y = 38;

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
  const bg = hovered ? COLOR.surface3 : COLOR.surface0;
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
        rx={RADIUS.md}
        ry={RADIUS.md}
        fill={bg}
        stroke={COLOR.borderSoft}
        strokeWidth={1}
      />
      {/* Left accent bar */}
      <rect
        x={x}
        y={y + SPACING.sm}
        width={ACCENT_BAR_W}
        height={NODE_H - SPACING.lg}
        rx={RADIUS.hair}
        ry={RADIUS.hair}
        fill={borderColor}
      />
      {/* State dot */}
      <circle
        cx={x + NODE_W - SPACING.lg}
        cy={y + NODE_H / 2}
        r={DOT_R}
        fill={dot}
        opacity={0.9}
      />
      {/* Label */}
      <text
        x={x + TEXT_PAD_X}
        y={y + LABEL_BASELINE_Y}
        fontSize={FONT.base}
        fontWeight={FONT_WEIGHT.semibold}
        fill={COLOR.textPrimary}
        fontFamily="inherit"
      >
        {label}
      </text>
      {/* Subtitle */}
      <text
        x={x + TEXT_PAD_X}
        y={y + SUBTITLE_BASELINE_Y}
        fontSize={FONT.xxs}
        fontWeight={FONT_WEIGHT.regular}
        fill={COLOR.textMuted}
        fontFamily="inherit"
      >
        {subtitle.length > SUBTITLE_MAX_LEN ? subtitle.slice(0, SUBTITLE_TRUNC) + "…" : subtitle}
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
        stroke={COLOR.borderStrong}
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <polygon
        points={`${midX - 5},${arrowY} ${midX + 5},${arrowY} ${midX},${y2}`}
        fill={COLOR.textFaint}
      />
    </g>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ node }: { node: NodeDef }) {
  return (
    <div
      style={{
        background: COLOR.overlayModal,
        border: `1px solid ${COLOR.border}`,
        borderRadius: RADIUS.lg,
        padding: `${SPACING.lg}px`,
        minWidth: SIZE.labelMaxW,
        maxWidth: SIZE.modalMaxWidth,
        backdropFilter: BLUR.tooltip,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: FONT.md,
          fontWeight: FONT_WEIGHT.semibold,
          color: COLOR.textPrimary,
          marginBottom: SPACING.sm,
        }}
      >
        {node.label}
      </div>
      <div
        style={{
          fontSize: FONT.sm,
          color: COLOR.textMuted,
          marginBottom: SPACING.md,
          textTransform: "uppercase",
          letterSpacing: LETTER_SPACING.tight,
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
              gap: SPACING.hair,
              marginBottom: SPACING.sm,
              paddingBottom: SPACING.sm,
              borderBottom: `1px solid ${COLOR.borderSoft}`,
            }}
          >
            <span
              style={{
                fontSize: FONT.xs,
                color: COLOR.textFaint,
                textTransform: "uppercase",
                letterSpacing: LETTER_SPACING.tight,
              }}
            >
              {k}
            </span>
            <span
              style={{
                fontSize: FONT.sm,
                color: COLOR.textBody,
                wordBreak: "break-word",
              }}
            >
              {v.length > DETAIL_VALUE_MAX_LEN ? v.slice(0, DETAIL_VALUE_TRUNC) + "…" : v}
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
          minHeight: SIZE.panelBasis,
          gap: SPACING.xl,
          color: COLOR.textMuted,
          fontSize: FONT.md,
        }}
      >
        <span>Aucune analyse disponible</span>
        <Link
          href="/automobile/nouvelle"
          style={{
            color: COLOR.accentStrong,
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
        Sortie: collectorStep?.output_text?.slice(0, STEP_OUTPUT_PREVIEW),
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
        Sortie: riskStep?.output_text?.slice(0, STEP_OUTPUT_PREVIEW),
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
        Sortie: writerStep?.output_text?.slice(0, STEP_OUTPUT_PREVIEW),
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
        "Résultat (extrait)": run.result_text?.slice(0, RESULT_PREVIEW),
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
      <div style={{ flex: `1 1 ${SIZE.panelBasis}px`, minWidth: SIZE.panelMinW }}>
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          width="100%"
          style={{
            display: "block",
            background: COLOR.overlayModal,
            borderRadius: RADIUS.lg,
            border: `1px solid ${COLOR.borderSoft}`,
          }}
          aria-label="Decision flow canvas"
        >
          {/* Background grid hint */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={COLOR.surface0} strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={VB_W} height={VB_H} fill="url(#grid)" />

          {/* Title */}
          <text
            x={VB_W / 2}
            y={24}
            textAnchor="middle"
            fontSize={FONT.xxs}
            fontWeight={FONT_WEIGHT.semibold}
            fill={COLOR.textFaint}
            fontFamily="inherit"
            letterSpacing={LETTER_SPACING.mid}
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
          flex: `0 0 ${SIZE.sidebarW}px`,
          minWidth: SIZE.labelMaxW,
          maxWidth: SIZE.modalMaxWidth,
          position: "sticky",
          top: SPACING.xxl,
        }}
      >
        {hoveredNode ? (
          <DetailPanel node={hoveredNode} />
        ) : (
          <div
            style={{
              background: COLOR.overlayDarkStrong,
              border: `1px dashed ${COLOR.borderSoft}`,
              borderRadius: RADIUS.lg,
              padding: `${SPACING.xl}px`,
              textAlign: "center",
              color: COLOR.textFaint,
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
            background: COLOR.overlayDarkStrong,
            border: `1px solid ${COLOR.borderSoft}`,
            borderRadius: RADIUS.lg,
            padding: `${SPACING.lg}px`,
            display: "flex",
            flexDirection: "column",
            gap: SPACING.sm,
          }}
        >
          {[
            { label: "Run ID", value: run.id.slice(0, RUN_ID_SHORT) + "…" },
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
                borderBottom: `1px solid ${COLOR.surface1}`,
                fontSize: FONT.sm,
              }}
            >
              <span style={{ color: COLOR.textFaint }}>{label}</span>
              <span
                style={{
                  color:
                    label === "Recommandation"
                      ? REC_COLORS[recommendation]
                      : COLOR.textBody,
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
              color: COLOR.accentStrong,
              textDecoration: "none",
              padding: `${SPACING.sm}px`,
              borderRadius: RADIUS.sm,
              border: `1px solid ${COLOR.borderAccent}`,
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
