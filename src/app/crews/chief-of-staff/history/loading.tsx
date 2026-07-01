import { Skeleton } from "@/components/ui";

/**
 * Skeleton de chargement de l'historique Chief of Staff — affiché pendant
 * le fetch serveur (crewaiClient.listRuns). Évite l'écran blanc.
 */
export default function HistoryLoading() {
  return (
    <>
      {/* Breadcrumb skeleton */}
      <Skeleton className="mb-2 h-3.5 w-20" />

      {/* Titre + sous-titre */}
      <div className="mb-6 mt-2 space-y-1.5">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3.5 w-64" />
      </div>

      {/* Section runs skeleton */}
      <section aria-busy="true" aria-live="polite" className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-60 rounded-[var(--radius-lg)]" />
      </section>

      <p className="mt-3 text-sm text-content-muted">Loading…</p>
    </>
  );
}
