import { FONT } from "@/lib/ui/tokens";
import type { TimelineMarker } from "@/lib/crews/chiefTypes";

interface Props {
  markers: TimelineMarker[];
}

function dotColor(variant: TimelineMarker["variant"]): string {
  switch (variant) {
    case "done":
      return "var(--cos-accent)";
    case "now":
      return "var(--cos-warn)";
    case "future":
      return "var(--ct-border)";
  }
}

function dotBoxShadow(variant: TimelineMarker["variant"]): string | undefined {
  if (variant === "now") {
    return "0 0 8px 2px rgba(255,180,84,0.5)";
  }
  return undefined;
}

export function DayTimeline({ markers }: Props) {
  if (markers.length === 0) return <></>;

  const nowMarker = markers.find((m) => m.variant === "now");
  const fillPercent = nowMarker?.leftPercent ?? 0;

  return (
    <div
      style={{
        position: "relative",
        height: 56,
        marginBottom: 8,
      }}
    >
      {/* Rail background */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 2,
          background: "var(--ct-border)",
          transform: "translateY(-50%)",
          borderRadius: 1,
        }}
      />

      {/* Rail fill */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          width: `${fillPercent}%`,
          height: 2,
          background: "var(--cos-accent)",
          transform: "translateY(-50%)",
          borderRadius: 1,
          transition: "width 0.4s ease",
        }}
      />

      {/* Markers */}
      {markers.map((marker, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${marker.leftPercent}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* Time above */}
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: FONT.xs,
              color: "var(--ct-text-faint)",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {marker.time}
          </div>

          {/* Dot */}
          <div
            style={{
              width: marker.variant === "now" ? 10 : 8,
              height: marker.variant === "now" ? 10 : 8,
              borderRadius: "50%",
              background: dotColor(marker.variant),
              boxShadow: dotBoxShadow(marker.variant),
            }}
          />

          {/* Label below */}
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: FONT.xs,
              color:
                marker.variant === "now"
                  ? "var(--cos-warn)"
                  : marker.variant === "done"
                  ? "var(--ct-text-muted)"
                  : "var(--ct-text-faint)",
              whiteSpace: "nowrap",
              fontWeight: marker.variant === "now" ? 600 : 400,
            }}
          >
            {marker.label}
          </div>
        </div>
      ))}
    </div>
  );
}
