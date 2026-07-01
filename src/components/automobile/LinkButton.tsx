import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

type Variant = "primary" | "secondary";

const BASE =
  "inline-flex h-9 items-center justify-center rounded-[var(--radius-md)] px-4 " +
  "text-sm font-semibold transition-colors whitespace-nowrap";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-strong",
  secondary:
    "bg-surface-3 text-content ring-1 ring-inset ring-line hover:bg-elevated",
};

/**
 * Lien stylé comme un bouton du DS (les primitives Button rendent un <button>,
 * pas polymorphe). Utilisé pour les actions de navigation dans l'espace
 * Automobile. L'accent devient ambre automatiquement sous [data-product=automobile].
 */
export function LinkButton({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(BASE, VARIANTS[variant], className)} {...props} />;
}
