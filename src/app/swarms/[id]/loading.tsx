import { SPACING, RADIUS, OPACITY, SIZE } from "@/lib/ui/tokens";

/**
 * Skeleton de chargement du détail swarm /swarms/[id] — affiché pendant
 * le fetch serveur (swarmsClient.get + swarmsClient.listRuns).
 */
export default function SwarmDetailLoading() {
  return (
    <>
      {/* Breadcrumb skeleton */}
      <div
        style={{
          width: 80,
          height: SIZE.skeletonTitle,
          background: "var(--ct-surface-2)",
          borderRadius: RADIUS.sm,
          opacity: OPACITY.skeletonStrong,
          marginBottom: SPACING.md,
        }}
      />

      {/* Titre + StatusBadge skeleton */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: SPACING.lg,
          flexWrap: "wrap",
          marginBottom: SPACING.md,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: SPACING.md,
              marginBottom: SPACING.sm,
            }}
          >
            <div
              style={{
                width: 220,
                height: 28,
                background: "var(--ct-surface-2)",
                borderRadius: RADIUS.sm,
                opacity: OPACITY.skeletonStrong,
              }}
            />
            {/* Badge skeleton */}
            <div
              style={{
                width: 64,
                height: 20,
                background: "var(--ct-surface-2)",
                borderRadius: RADIUS.full,
                opacity: OPACITY.skeletonSoft,
              }}
            />
          </div>
          <div
            style={{
              width: 280,
              height: SIZE.skeletonTitle,
              background: "var(--ct-surface-2)",
              borderRadius: RADIUS.sm,
              opacity: OPACITY.skeletonFaint,
            }}
          />
        </div>
        {/* Actions skeleton */}
        <div style={{ display: "flex", gap: SPACING.sm }}>
          <div
            style={{
              width: 72,
              height: 32,
              background: "var(--ct-surface-2)",
              borderRadius: RADIUS.md,
              opacity: OPACITY.skeletonSoft,
            }}
          />
          <div
            style={{
              width: 120,
              height: 32,
              background: "var(--ct-surface-2)",
              borderRadius: RADIUS.md,
              opacity: OPACITY.skeletonFaint,
            }}
          />
        </div>
      </div>

      {/* KPIs skeleton — 4 cartes */}
      <div
        aria-busy="true"
        aria-live="polite"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: SPACING.md,
          marginBottom: SPACING.xl,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="ct-card"
            style={{ marginBottom: 0, opacity: OPACITY.skeletonStrong, minHeight: 72 }}
          />
        ))}
      </div>

      {/* Composition card skeleton */}
      <div
        className="ct-card"
        style={{ opacity: OPACITY.skeletonStrong, minHeight: 140, marginBottom: SPACING.md }}
      />

      {/* Runs récents card skeleton */}
      <div className="ct-card" style={{ padding: 0, overflow: "hidden", opacity: OPACITY.skeletonStrong }}>
        <div
          style={{
            height: 44,
            background: "var(--ct-surface-2)",
            borderBottom: "1px solid var(--ct-border-soft)",
          }}
        />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 48,
              background: "var(--ct-surface-2)",
              opacity: i % 2 === 0 ? OPACITY.skeletonStrong : OPACITY.skeletonFaint,
              borderBottom: "1px solid var(--ct-border-soft)",
            }}
          />
        ))}
      </div>

      <p className="ct-sub" style={{ marginTop: SPACING.md }}>
        Loading…
      </p>
    </>
  );
}
