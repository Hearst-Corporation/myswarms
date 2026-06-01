import { TrainingCanvas } from "@/components/training/TrainingCanvas";
import { FONT, FONT_WEIGHT, SPACING } from "@/lib/ui/tokens";

export const metadata = { title: "Training — MySwarms" };

export default function TrainingPage() {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "#080811",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ padding: `${SPACING.md}px ${SPACING.lx}px`, display: "flex", alignItems: "center", gap: SPACING.lg }}>
        <span style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", fontWeight: FONT_WEIGHT.bold, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Cockpit · MySwarms
        </span>
        <span style={{ fontSize: FONT.xs, color: "#6366f1", fontWeight: FONT_WEIGHT.bold, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          GPU Training
        </span>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <TrainingCanvas />
      </div>
    </div>
  );
}
