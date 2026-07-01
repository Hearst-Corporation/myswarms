import { cn } from "@/lib/ui/cn";

/** Petit label de section en capitales. API historique préservée (text, mb). */
export function SectionLabel({ text, mb }: { text: string; mb?: number }) {
  return (
    <span
      className={cn(
        "block text-[10px] font-bold uppercase tracking-wider text-content-muted",
        mb === undefined && "mb-2",
      )}
      style={mb !== undefined ? { marginBottom: mb } : undefined}
    >
      {text}
    </span>
  );
}
