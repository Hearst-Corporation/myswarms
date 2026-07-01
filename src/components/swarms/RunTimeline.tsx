"use client";

import { useState } from "react";
import { StepCard } from "./StepCard";
import { StatusBadge } from "@/components/runs/StatusBadge";
import type { SwarmRunStep } from "@/lib/forms/swarmSchemas";
import { Card, CardBody, EmptyState } from "@/components/ui";
import { ChevronRightIcon } from "@heroicons/react/24/outline";

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
    <Card className="mb-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-2/60"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ChevronRightIcon
            className={
              "size-4 shrink-0 text-content-faint transition-transform " +
              (open ? "rotate-90" : "")
            }
            aria-hidden="true"
          />
          <span className="font-semibold text-content-strong">
            {group.agentName}
          </span>
          <span className="text-xs text-content-muted">
            {group.steps.length} step{group.steps.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-content-muted">
            {group.totalTokens.toLocaleString("en-US")} tok
          </span>
          <StatusBadge status={group.status} />
        </div>
      </button>

      {open && (
        <div className="border-t border-line p-3">
          {group.steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      )}
    </Card>
  );
}

export function RunTimeline({ steps, status }: RunTimelineProps) {
  if (steps.length === 0) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="No steps" description={emptyMessage(status)} />
        </CardBody>
      </Card>
    );
  }

  const groups = groupByAgent(steps);
  const lastIdx = groups.length - 1;

  return (
    <div className="flex flex-col">
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
