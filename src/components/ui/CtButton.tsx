"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

interface CtButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  "aria-label"?: string;
  title?: string;
}

const VARIANT_CLS: Record<NonNullable<CtButtonProps["variant"]>, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary:
    "bg-surface-3 text-content ring-1 ring-inset ring-line hover:bg-elevated",
  ghost: "bg-transparent text-content-muted hover:bg-surface-2 hover:text-content",
};

/**
 * Bouton segmenté du DS MySwarms. API historique préservée
 * (variant/loading/…) — rendu réécrit en utilities Tailwind.
 */
export function CtButton({
  variant = "secondary",
  loading = false,
  type = "button",
  disabled = false,
  onClick,
  className,
  style,
  children,
  "aria-label": ariaLabel,
  title,
}: CtButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4",
        "text-sm font-semibold transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLS[variant],
        className,
      )}
      disabled={loading || disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      title={title}
      style={style}
    >
      {children}
      {loading && (
        <span aria-hidden="true" className="ml-1 animate-pulse">
          …
        </span>
      )}
    </button>
  );
}
