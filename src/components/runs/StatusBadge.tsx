import { RADIUS, FONT } from "@/lib/ui/tokens";

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  completed: { bg: "rgb(220 252 231)", color: "rgb(22 101 52)" },
  running: { bg: "rgb(219 234 254)", color: "rgb(30 64 175)" },
  failed: { bg: "rgb(254 226 226)", color: "rgb(153 27 27)" },
  cancelled: { bg: "rgb(229 229 229)", color: "rgb(64 64 64)" },
  paused_hitl: { bg: "rgb(254 243 199)", color: "rgb(146 64 14)" },
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const s = STATUS_STYLES[status] ?? { bg: "rgb(245 245 245)", color: "rgb(64 64 64)" };
  const paddingInline = size === "md" ? "10px" : "10px";
  const paddingBlock = size === "md" ? "4px" : "2px";
  return (
    <span
      style={{
        display: "inline-flex",
        borderRadius: RADIUS.full,
        paddingInline,
        paddingBlock,
        fontSize: FONT.xxs,
        fontWeight: 500,
        background: s.bg,
        color: s.color,
      }}
    >
      {status}
    </span>
  );
}
