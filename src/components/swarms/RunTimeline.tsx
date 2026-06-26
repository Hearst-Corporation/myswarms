"use client";

import { useState } from "react";
import { StepCard } from "./StepCard";
import { StatusBadge } from "@/components/runs/StatusBadge";
import type { SwarmRunStep } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, SPACING } from "@/lib/ui/tokens";

interface RunTimelineProps {
  steps: SwarmRunStep[];
  status?: string;
}

function emptyMessage(status?: string): string {
  if (status === "pending") return "Waiting to start…";
  if (status === "running" || status === "paused_hitl")
    return "Running — first step imminent…";
  if (status === "failed" || status === "cancelled")
    return "No step recorded (stopped before execution).";
  return "No step executed yet.";
}

interface AgentGroup {
  agentName: string;
  steps: SwarmRunStep[];
  status: string;
  totalTokens: number;
}

function groupByAgent(steps: SwarmRunStep[]): AgentGroup[] {
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);
  const groups: AgentGroup[] = [];
  const seen = new Map<string, AgentGroup>();

  for (const step of sorted) {
    const name = step.agent_name ?? "Unknown agent";
    if (!seen.has(name)) {
      const g: AgentGroup = {
        agentName: name,
        steps: [],
        status: "pending",
        totalTokens: 0,
      };
      seen.set(name, g);
      groups.push(g);
    }
    const g = seen.get(name)!;
    g.steps.push(step);
    g.totalTokens += step.tokens_in + step.tokens_out;
  }

  for (const g of groups) {
    if (g.steps.some((s) => s.status === "failed")) g.status = "failed";
    else if (g.steps.some((s) => s.status === "running")) g.status = "running";
    else if (g.steps.every((s) => s.status === "completed")) g.status = "completed";
    else g.status = g.steps[g.steps.length - 1]?.status ?? "pending";
  }

  return groups;
}

function AgentGroupRow({
  group,
  defaultOpen,
}: {
  group: AgentGroup;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="ct-card"
      style={{ marginBottom: SPACING.md, padding: 0, overflow: "hidden" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: `${SPACING.md}px ${SPACING.lx}px`,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: SPACING.md,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACING.md,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: FONT.xs,
              color: "var(--ct-text-faint)",
              display: "inline-block",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s",
              flexShrink: 0,
            }}
          >
            ▶
          </span>
          <span
            style={{
              fontWeight: FONT_WEIGHT.semibold,
              color: "var(--ct-text-strong)",
              fontSize: FONT.base,
            }}
          >
            {group.agentName}
          </span>
          <span style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)" }}>
            {group.steps.length} step{group.steps.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACING.md,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)" }}>
            {group.totalTokens.toLocaleString("en-US")} tok
          </span>
          <StatusBadge status={group.status} />
        </div>
      </button>

      {open && (
        <div
          style={{
            borderTop: "1px solid var(--ct-border-soft)",
            padding: `${SPACING.md}px`,
          }}
        >
          {group.steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RunTimeline({ steps, status }: RunTimelineProps) {
  if (steps.length === 0) {
    return (
      <div className="ct-card">
        <p className="ct-placeholder">{emptyMessage(status)}</p>
      </div>
    );
  }

  const groups = groupByAgent(steps);
  const lastIdx = groups.length - 1;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((group, idx) => (
        <AgentGroupRow
          key={group.agentName}
          group={group}
          defaultOpen={idx === lastIdx}
        />
      ))}
    </div>
  );
}
