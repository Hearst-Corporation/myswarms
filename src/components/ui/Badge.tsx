import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

type Tone = "neutral" | "accent" | "ok" | "running" | "warn" | "danger";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-content-muted ring-line",
  accent: "bg-accent/15 text-accent-strong ring-accent/30",
  ok: "bg-[color-mix(in_oklab,var(--color-ok)_15%,transparent)] text-[var(--color-ok)] ring-[color-mix(in_oklab,var(--color-ok)_30%,transparent)]",
  running:
    "bg-[color-mix(in_oklab,var(--color-running)_15%,transparent)] text-[var(--color-running)] ring-[color-mix(in_oklab,var(--color-running)_30%,transparent)]",
  warn: "bg-[color-mix(in_oklab,var(--color-warn)_15%,transparent)] text-[var(--color-warn)] ring-[color-mix(in_oklab,var(--color-warn)_30%,transparent)]",
  danger:
    "bg-[color-mix(in_oklab,var(--color-danger)_15%,transparent)] text-[var(--color-danger)] ring-[color-mix(in_oklab,var(--color-danger)_30%,transparent)]",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function Badge({ className, tone = "neutral", dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
