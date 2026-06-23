import { SPACING, RADIUS, OPACITY, SIZE } from "@/lib/ui/tokens";

/**
 * Skeleton de chargement de la liste Swarms — affiché pendant le fetch
 * serveur (swarmsClient.list). Évite l'écran blanc au cold-start.
 */
export default function SwarmsLoading() {
  return (
    <>
      {/* Eyebrow + titre */}
      <span className="ct-eyebrow">Cockpit · MySwarms</span>
      <h1 className="ct-title">Swarms</h1>
      <p className="ct-sub">Loading…</p>

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

      {/* Header liste skeleton */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: SPACING.lg,
        }}
      >
        <div
          style={{
            width: 100,
            height: SIZE.skeletonLine,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.sm,
            opacity: OPACITY.skeletonStrong,
          }}
        />
        <div
          style={{
            width: 120,
            height: 32,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.md,
            opacity: OPACITY.skeletonSoft,
          }}
        />
      </div>

      {/* SwarmList skeleton — 4 lignes */}
      <div className="ct-card" style={{ padding: 0, overflow: "hidden" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 52,
              background: "var(--ct-surface-2)",
              opacity: i % 2 === 0 ? OPACITY.skeletonStrong : OPACITY.skeletonFaint,
              borderBottom: "1px solid var(--ct-border-soft)",
            }}
          />
        ))}
      </div>
    </>
  );
}
