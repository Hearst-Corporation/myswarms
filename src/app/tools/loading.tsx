import { Skeleton } from "@/components/ui";

/**
 * Skeleton de chargement du catalogue Tools — affiché pendant le fetch
 * serveur (engine CrewAI). Évite l'écran figé si le moteur est lent/froid.
 */
export default function ToolsLoading() {
  return (
    <>
      <span className="block text-xs font-semibold uppercase tracking-wider text-accent">
        Catalog
      </span>
      <h1 className="text-xl font-semibold tracking-tight text-content-strong">Tools</h1>
      <p className="mb-6 text-sm text-content-muted">Loading catalog…</p>

      <div
        aria-busy="true"
        aria-live="polite"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
        ))}
      </div>
    </>
  );
}
