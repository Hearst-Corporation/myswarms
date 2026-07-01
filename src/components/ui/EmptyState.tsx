import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** État vide standard : icône + titre + description + action optionnelle. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-lg)]",
        "border border-dashed border-line-strong bg-surface/40 px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 text-content-faint [&>svg]:size-10" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-content-strong">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-content-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
