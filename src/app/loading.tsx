import { SPACING } from "@/lib/ui/tokens";

export default function HomeLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Header skeleton */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: SPACING.xxl,
        }}
      >
        <div>
          <div
            style={{
              width: 120,
              height: 10,
              background: "var(--ct-surface-2)",
              borderRadius: 4,
              opacity: 0.4,
              marginBottom: SPACING.sm,
            }}
          />
          <div
            style={{
              width: 200,
              height: 28,
              background: "var(--ct-surface-2)",
              borderRadius: 4,
              opacity: 0.5,
              marginBottom: SPACING.sm,
            }}
          />
          <div
            style={{
              width: 180,
              height: 12,
              background: "var(--ct-surface-2)",
              borderRadius: 4,
              opacity: 0.3,
            }}
          />
        </div>
        <div
          style={{
            width: 140,
            height: 36,
            background: "var(--ct-surface-2)",
            borderRadius: 8,
            opacity: 0.5,
          }}
        />
      </div>

      {/* KPI skeletons */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: SPACING.lg,
          marginBottom: SPACING.xxl,
        }}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="ct-card"
            style={{ opacity: 0.45, minHeight: 96, marginBottom: 0 }}
          />
        ))}
      </div>

      {/* Table skeleton */}
      <div>
        <div
          style={{
            width: 160,
            height: 10,
            background: "var(--ct-surface-2)",
            borderRadius: 4,
            opacity: 0.4,
            marginBottom: SPACING.md,
          }}
        />
        <div
          className="ct-card"
          style={{ opacity: 0.4, minHeight: 240, marginBottom: 0, padding: 0 }}
        />
      </div>
    </div>
  );
}
