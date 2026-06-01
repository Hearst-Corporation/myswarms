"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshProps {
  /** Polling interval in seconds (default: 5). */
  seconds?: number;
  /** When false the interval is not started (default: true). */
  active?: boolean;
}

/**
 * Invisible client component that calls router.refresh() on a fixed interval
 * while `active` is true. Used on run detail pages to re-fetch Server Component
 * data while the crew flow is still running (status="running").
 *
 * router.refresh() re-fetches RSC payload from the server without a full page
 * reload — the user sees updated status/result as the crew progresses.
 * The interval is cleared automatically when `active` becomes false
 * (e.g. when status transitions to completed/failed/cancelled).
 *
 * Visibility guard: skips router.refresh() while the tab is hidden to avoid
 * wasting billable RSC requests when the user has backgrounded the tab.
 */
export function AutoRefresh({ seconds = 5, active = true }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    const MS_PER_SECOND = 1_000;
    const interval = setInterval(() => {
      if (document.hidden) return;
      router.refresh();
    }, seconds * MS_PER_SECOND);

    return () => clearInterval(interval);
  }, [seconds, active, router]);

  return null;
}
