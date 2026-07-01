import { Badge } from "@/components/ui";

type BadgeTone = "neutral" | "accent" | "ok" | "running" | "warn" | "danger";

const STATUS_TONE: Record<string, BadgeTone> = {
  completed: "ok",
  running: "running",
  pending: "running",
  paused_hitl: "warn",
  failed: "danger",
  cancelled: "neutral",
};

export function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <Badge
      tone={tone}
      dot
      className={size === "md" ? "px-3 py-1 text-sm" : undefined}
    >
      {status}
    </Badge>
  );
}
