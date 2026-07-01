import { Skeleton } from "@/components/ui";

/**
 * Skeleton de chargement de la page détail d'un run Chief of Staff.
 * Affiché pendant le fetch serveur (cold-start engine possible).
 */
export default function ChiefRunLoading() {
  return (
    <>
      {/* Breadcrumb */}
      <Skeleton className="mb-3 h-3.5 w-20" />

      {/* Titre */}
      <Skeleton className="mb-2 h-7 w-44" />

      {/* StatusBadge + trigger */}
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="h-3.5 w-28" />
      </div>

      {/* Dates grid — 2 cards */}
      <div
        aria-busy="true"
        aria-live="polite"
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-[var(--radius-lg)]" />
        ))}
      </div>

      {/* Résultat card */}
      <Skeleton className="mb-2 h-3.5 w-16" />
      <Skeleton className="mb-6 h-32 rounded-[var(--radius-lg)]" />

      {/* State card */}
      <Skeleton className="mb-2 h-3.5 w-14" />
      <Skeleton className="h-20 rounded-[var(--radius-lg)]" />

      <p className="mt-4 text-sm text-content-muted">Loading run…</p>
    </>
  );
}
