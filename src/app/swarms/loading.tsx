import { Skeleton } from "@/components/ui";

/**
 * Skeleton de chargement de la liste Swarms — affiché pendant le fetch
 * serveur (swarmsClient.list). Évite l'écran blanc au cold-start.
 */
export default function SwarmsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      {/* Eyebrow + titre */}
      <div className="border-b border-line pb-5">
        <Skeleton className="mb-2 h-3 w-32" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      {/* KPIs skeleton — 4 cartes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-[var(--radius-lg)]" />
        ))}
      </div>

      {/* Header liste skeleton */}
      <Skeleton className="h-3 w-24" />

      {/* SwarmList skeleton — 4 lignes */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] ring-1 ring-inset ring-line">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-[52px] rounded-none border-b border-line"
          />
        ))}
      </div>
    </div>
  );
}
