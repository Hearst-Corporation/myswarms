import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

/** Placeholder de chargement animé. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-[var(--radius-sm)] bg-surface-3", className)}
      {...props}
    />
  );
}
