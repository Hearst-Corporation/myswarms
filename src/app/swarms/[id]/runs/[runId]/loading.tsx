import { Skeleton } from "@/components/ui";

/**
 * Skeleton de chargement de la page détail d'un run Swarm.
 * Affiché pendant le fetch serveur (cold-start engine possible).
 */
export default function SwarmRunLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      {/* Breadcrumb skeleton */}
      <Skeleton className="h-3 w-20" />

      {/* Titre + StatusBadge + trigger skeleton */}
      <div className="border-b border-line pb-5">
        <Skeleton className="h-7 w-52" />
        <div className="mt-3 flex items-center gap-3">
          <Skeleton className="h-5 w-[72px] rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>

      {/* KPIs skeleton — cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-[var(--radius-lg)]" />
        ))}
      </div>

      {/* Métadonnées card skeleton */}
      <Skeleton className="h-20 rounded-[var(--radius-lg)]" />

      {/* Timeline skeleton */}
      <Skeleton className="h-3 w-32" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-12 rounded-[var(--radius-lg)]" />
      ))}
    </div>
  );
}
