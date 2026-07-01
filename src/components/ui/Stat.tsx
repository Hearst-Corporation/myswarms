import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** Grille responsive de KPIs (auto-fit). */
export function KpiGrid({ className, ...props }: HTMLAttributes<HTMLDListElement>) {
  return (
    <dl
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}
      {...props}
    />
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  trend?: { value: string; up?: boolean };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] bg-surface px-5 py-4 ring-1 ring-inset ring-line",
        className,
      )}
    >
      <dt className="flex items-center gap-2 text-xs font-medium text-content-muted">
        {icon ? (
          <span className="text-accent [&>svg]:size-4" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight text-content-strong">
          {value}
        </span>
        {trend ? (
          <span
            className={cn(
              "text-xs font-medium",
              trend.up ? "text-[var(--color-ok)]" : "text-[var(--color-danger)]",
            )}
          >
            {trend.value}
          </span>
        ) : null}
      </dd>
      {hint ? <p className="mt-1 text-xs text-content-faint">{hint}</p> : null}
    </div>
  );
}
