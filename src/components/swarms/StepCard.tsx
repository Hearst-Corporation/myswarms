import { StatusBadge } from "@/components/runs/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { SwarmRunStep } from "@/lib/forms/swarmSchemas";
import { Chevron } from "@/components/ui";

interface StepCardProps {
  step: SwarmRunStep;
}

export function StepCard({ step }: StepCardProps) {
  const totalTokens = step.tokens_in + step.tokens_out;
  return (
    <div className="mb-3 rounded-[var(--radius-md)] bg-surface-2 p-4 ring-1 ring-inset ring-line">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-content-muted">
            #{String(step.step_number).padStart(3, "0")}
          </span>
          <span className="font-semibold text-content-strong">
            {step.agent_name ?? "agent inconnu"}
          </span>
          {step.task_name ? (
            <span className="inline-flex items-center text-sm text-content-muted">
              <Chevron direction="right" />
              {step.task_name}
            </span>
          ) : null}
        </div>
        <StatusBadge status={step.status} />
      </div>

      <div
        className={cnRow(step.output_text != null || step.error_text != null)}
      >
        <span>tokens: {totalTokens}</span>
        {step.latency_ms ? <span>latency: {step.latency_ms}ms</span> : null}
        <span>start: {formatDate(step.created_at, { withSeconds: true })}</span>
        {step.finished_at ? (
          <span>end: {formatDate(step.finished_at, { withSeconds: true })}</span>
        ) : null}
      </div>

      {step.error_text != null && step.error_text !== "" ? (
        <pre className="overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[color-mix(in_oklab,var(--color-danger)_10%,transparent)] p-3 text-sm text-content ring-1 ring-inset ring-[color-mix(in_oklab,var(--color-danger)_30%,transparent)]">
          {step.error_text}
        </pre>
      ) : step.output_text != null ? (
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-surface p-3 text-sm text-content ring-1 ring-inset ring-line">
          {step.output_text}
        </pre>
      ) : null}
    </div>
  );
}

function cnRow(hasBody: boolean): string {
  return (
    "flex flex-wrap gap-5 text-xs text-content-muted " +
    (hasBody ? "mb-3" : "")
  );
}
