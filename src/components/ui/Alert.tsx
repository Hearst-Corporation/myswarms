import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

type Tone = "info" | "success" | "warning" | "error";

const TONES: Record<Tone, string> = {
  info: "bg-accent/10 text-accent-strong ring-accent/25",
  success:
    "bg-[color-mix(in_oklab,var(--color-ok)_12%,transparent)] text-[var(--color-ok)] ring-[color-mix(in_oklab,var(--color-ok)_25%,transparent)]",
  warning:
    "bg-[color-mix(in_oklab,var(--color-warn)_12%,transparent)] text-[var(--color-warn)] ring-[color-mix(in_oklab,var(--color-warn)_25%,transparent)]",
  error:
    "bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] text-[var(--color-danger)] ring-[color-mix(in_oklab,var(--color-danger)_25%,transparent)]",
};

/** Bandeau d'alerte inline (info/success/warning/error). */
export function Alert({
  tone = "info",
  title,
  children,
  className,
  role = "status",
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={cn(
        "rounded-[var(--radius-md)] px-4 py-3 text-sm ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && "mt-1", "opacity-90")}>{children}</div> : null}
    </div>
  );
}
