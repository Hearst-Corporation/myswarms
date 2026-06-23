import { SPACING, RADIUS, OPACITY, SIZE } from "@/lib/ui/tokens";

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
              height: SIZE.skeletonBar,
              background: "var(--ct-surface-2)",
              borderRadius: RADIUS.sm,
              opacity: OPACITY.skeletonSoft,
              marginBottom: SPACING.sm,
            }}
          />
          <div
            style={{
              width: 200,
              height: 28,
              background: "var(--ct-surface-2)",
              borderRadius: RADIUS.sm,
              opacity: OPACITY.skeletonStrong,
              marginBottom: SPACING.sm,
            }}
          />
          <div
            style={{
              width: 180,
              height: SIZE.skeletonLine,
              background: "var(--ct-surface-2)",
              borderRadius: RADIUS.sm,
              opacity: OPACITY.skeletonFaint,
            }}
          />
        </div>
        <div
          style={{
            width: 140,
            height: 36,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.md,
            opacity: OPACITY.skeletonStrong,
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
            style={{ opacity: OPACITY.skeleton, minHeight: SIZE.skeletonCardMinH, marginBottom: 0 }}
          />
        ))}
      </div>

      {/* Table skeleton */}
      <div>
        <div
          style={{
            width: 160,
            height: SIZE.skeletonBar,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.sm,
            opacity: OPACITY.skeletonSoft,
            marginBottom: SPACING.md,
          }}
        />
        <div
          className="ct-card"
          style={{ opacity: OPACITY.skeletonSoft, minHeight: SIZE.skeletonBlockMinH, marginBottom: 0, padding: 0 }}
        />
      </div>
    </div>
  );
}
