import { SPACING, RADIUS, OPACITY, SIZE } from "@/lib/ui/tokens";

/**
 * Skeleton de chargement de la page détail d'un run Swarm.
 * Affiché pendant le fetch serveur (cold-start engine possible).
 */
export default function SwarmRunLoading() {
  return (
    <>
      {/* Breadcrumb skeleton */}
      <div
        className="ct-eyebrow"
        style={{
          width: 80,
          height: SIZE.skeletonTitle,
          background: "var(--ct-surface-2)",
          borderRadius: RADIUS.sm,
          opacity: OPACITY.skeletonStrong,
          marginBottom: SPACING.md,
        }}
      />

      {/* Titre skeleton */}
      <div
        style={{
          width: 200,
          height: 28,
          background: "var(--ct-surface-2)",
          borderRadius: RADIUS.sm,
          opacity: OPACITY.skeletonStrong,
          marginBottom: SPACING.md,
        }}
      />

      {/* StatusBadge + trigger skeleton */}
      <div
        style={{
          display: "flex",
          gap: SPACING.md,
          alignItems: "center",
          marginBottom: SPACING.xl,
        }}
      >
        <div
          style={{
            width: 72,
            height: 22,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.full,
            opacity: OPACITY.skeletonStrong,
          }}
        />
        <div
          style={{
            width: 120,
            height: SIZE.skeletonTitle,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.sm,
            opacity: OPACITY.skeletonSoft,
          }}
        />
      </div>

      {/* KPIs skeleton — 4 cards */}
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

      {/* Métadonnées card skeleton */}
      <div
        className="ct-card"
        style={{ opacity: OPACITY.skeletonStrong, minHeight: 80, marginBottom: SPACING.md }}
      />

      {/* Timeline skeleton */}
      <div
        className="ct-eyebrow"
        style={{
          width: 120,
          height: SIZE.skeletonTitle,
          background: "var(--ct-surface-2)",
          borderRadius: RADIUS.sm,
          opacity: OPACITY.skeletonStrong,
          margin: `${SPACING.xl}px 0 ${SPACING.md}px`,
        }}
      />
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="ct-card"
          style={{ marginBottom: SPACING.sm, opacity: OPACITY.skeleton, minHeight: 48 }}
        />
      ))}

      <p className="ct-sub">Loading run…</p>
    </>
  );
}
