import { SPACING, RADIUS, OPACITY, SIZE } from "@/lib/ui/tokens";

/**
 * Skeleton de chargement de l'historique Chief of Staff — affiché pendant
 * le fetch serveur (crewaiClient.listRuns). Évite l'écran blanc.
 */
export default function HistoryLoading() {
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
          marginBottom: SPACING.sm,
        }}
      />

      {/* Titre + sous-titre */}
      <div style={{ marginTop: SPACING.sm, marginBottom: SPACING.xl }}>
        <div
          style={{
            width: 220,
            height: 28,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.sm,
            opacity: OPACITY.skeletonStrong,
            marginBottom: SPACING.xs,
          }}
        />
        <div
          style={{
            width: 260,
            height: SIZE.skeletonTitle,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.sm,
            opacity: OPACITY.skeletonSoft,
          }}
        />
      </div>

      {/* Section runs skeleton */}
      <section aria-busy="true" aria-live="polite">
        <div
          style={{
            width: 100,
            height: SIZE.skeletonLine,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.sm,
            opacity: OPACITY.skeletonStrong,
            marginBottom: SPACING.md,
          }}
        />

        {/* Tableau runs skeleton */}
        <div className="ct-card" style={{ padding: 0, overflow: "hidden" }}>
          {/* En-tête */}
          <div
            style={{
              height: 40,
              background: "var(--ct-surface-2)",
              opacity: OPACITY.skeletonStrong,
              borderBottom: "1px solid var(--ct-border-soft)",
            }}
          />
          {/* Lignes */}
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                height: 48,
                background: "var(--ct-surface-2)",
                opacity: i % 2 === 0 ? OPACITY.skeleton : OPACITY.skeletonFaint,
                borderBottom: "1px solid var(--ct-border-soft)",
              }}
            />
          ))}
        </div>
      </section>

      <p className="ct-sub" style={{ marginTop: SPACING.md }}>
        Loading…
      </p>
    </>
  );
}
