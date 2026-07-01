import { Skeleton } from "@/components/ui";

/**
 * Skeleton de chargement du détail swarm /swarms/[id] — affiché pendant
 * le fetch serveur (swarmsClient.get + swarmsClient.listRuns).
 */
export default function SwarmDetailLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-3 w-20" />

      {/* Titre + StatusBadge + actions skeleton */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-[72px] rounded-[var(--radius-sm)]" />
          <Skeleton className="h-9 w-28 rounded-[var(--radius-md)]" />
        </div>
      </div>

      {/* KPIs skeleton — 4 cartes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-[var(--radius-lg)]" />
        ))}
      </div>

      {/* Composition card skeleton */}
      <Skeleton className="h-36 rounded-[var(--radius-lg)]" />

      {/* Runs récents card skeleton */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] ring-1 ring-inset ring-line">
        <Skeleton className="h-11 rounded-none border-b border-line" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-12 rounded-none border-b border-line"
          />
        ))}
      </div>
    </div>
  );
}
