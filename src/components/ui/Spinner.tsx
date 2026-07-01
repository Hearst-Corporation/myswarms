import { cn } from "@/lib/ui/cn";

/** Spinner circulaire, teinté accent. */
export function Spinner({
  className,
  size = 20,
  "aria-label": ariaLabel = "Chargement",
}: {
  className?: string;
  size?: number;
  "aria-label"?: string;
}) {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-line border-t-accent",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
