import { Skeleton } from "@/components/ui";

export default function HomeLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      {/* Header skeleton */}
      <div className="mb-8 flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-9 w-36 rounded-[var(--radius-md)]" />
      </div>

      {/* KPI skeletons */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-60 rounded-[var(--radius-lg)]" />
      </div>
    </div>
  );
}
