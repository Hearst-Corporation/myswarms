import { SPACING, RADIUS, OPACITY, SIZE } from "@/lib/ui/tokens";

/**
 * Skeleton de chargement de la page détail d'un run Chief of Staff.
 * Affiché pendant le fetch serveur (cold-start engine possible).
 */
export default function ChiefRunLoading() {
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

      {/* Titre skeleton */}
      <div
        style={{
          width: 180,
          height: 28,
          background: "var(--ct-surface-2)",
          borderRadius: RADIUS.sm,
          opacity: OPACITY.skeletonStrong,
          marginBottom: SPACING.sm,
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
            width: SIZE.dot,
            height: SIZE.dot,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.full,
            opacity: OPACITY.skeletonSoft,
          }}
        />
        <div
          style={{
            width: 110,
            height: SIZE.skeletonTitle,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.sm,
            opacity: OPACITY.skeletonSoft,
          }}
        />
      </div>

      {/* Dates grid skeleton — 2 cards */}
      <div
        aria-busy="true"
        aria-live="polite"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: SPACING.lg,
          marginBottom: SPACING.xl,
        }}
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="ct-card"
            style={{ marginBottom: 0, opacity: OPACITY.skeletonStrong, minHeight: 64 }}
          />
        ))}
      </div>

      {/* Résultat card skeleton */}
      <div
        className="ct-eyebrow"
        style={{
          width: 60,
          height: SIZE.skeletonTitle,
          background: "var(--ct-surface-2)",
          borderRadius: RADIUS.sm,
          opacity: OPACITY.skeletonStrong,
          marginBottom: SPACING.sm,
        }}
      />
      <div
        className="ct-card"
        style={{ opacity: OPACITY.skeletonStrong, minHeight: 120, marginBottom: SPACING.xl }}
      />

      {/* State card skeleton */}
      <div
        className="ct-eyebrow"
        style={{
          width: 50,
          height: SIZE.skeletonTitle,
          background: "var(--ct-surface-2)",
          borderRadius: RADIUS.sm,
          opacity: OPACITY.skeletonStrong,
          marginBottom: SPACING.sm,
        }}
      />
      <div
        className="ct-card"
        style={{ opacity: OPACITY.skeleton, minHeight: 80 }}
      />

      <p className="ct-sub">Loading run…</p>
    </>
  );
}
