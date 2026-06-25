/**
 * Dev auth-bypass — SINGLE SOURCE OF TRUTH.
 *
 * This module is the ONLY place in the codebase that contains the logic for
 * the development authentication bypass. It is fail-closed in every deployed
 * environment.
 *
 * WHY multiple env checks are required (defense-in-depth):
 *
 *   - A single `NODE_ENV !== "production"` check is INSUFFICIENT for Vercel:
 *     Vercel sets `NODE_ENV="production"` on ALL deployments — both production
 *     AND preview. It cannot be trusted alone to distinguish "local dev" from
 *     "deployed to Vercel preview".
 *
 *   - `VERCEL_ENV` is set by Vercel only during deployments:
 *       • "production" on production deployments
 *       • "preview" on preview/branch deployments
 *       • "development" when using `vercel dev` locally (rare but possible)
 *     It is NOT set when running `next dev` locally.
 *
 *   - This project is ALSO deployed on non-Vercel hosts (Railway `next start`,
 *     Electron packaged build) where VERCEL_ENV is never set. On these hosts,
 *     `next start` only defaults NODE_ENV to "production" when the variable is
 *     UNSET — meaning a leaked DEV_BYPASS_AUTH=true with NODE_ENV unset would
 *     pass the old absence-only checks. To close this hole we now require a
 *     POSITIVE dev-runtime signal instead of merely the absence of prod signals.
 *
 *   - We fail-closed on ANY of:
 *       • NODE_ENV === "production"   (catches standard prod builds)
 *       • VERCEL_ENV === "production" (Vercel production deployment)
 *       • VERCEL_ENV === "preview"    (Vercel preview deployment — no bypass in CI)
 *
 *   - Defense-in-depth positive gate: bypass is permitted ONLY when an explicit
 *     local/dev runtime is declared:
 *       • NODE_ENV === "development"  (`next dev` — the normal local workflow)
 *       • VERCEL_ENV === "development" (`vercel dev` locally)
 *     On every other host (Railway, Electron, any unknown runtime) this gate
 *     refuses the bypass even if DEV_BYPASS_AUTH=true somehow leaks in.
 *
 * Allowing bypass requires ALL of the following:
 *   1. DEV_BYPASS_AUTH === "true"  (strict, case-sensitive)
 *   2. NODE_ENV !== "production"
 *   3. VERCEL_ENV is not "production" and not "preview"
 *   4. NODE_ENV === "development" OR VERCEL_ENV === "development"
 */

/** Stub owner UUID used when no DEV_BYPASS_OWNER_ID is configured. */
export const DEV_BYPASS_STUB_OWNER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Returns true ONLY when running in local development with bypass explicitly
 * enabled. Fail-closed in all Vercel (production + preview), Railway, Electron,
 * and any other non-dev runtime. Requires an explicit dev-runtime signal
 * (NODE_ENV=development or VERCEL_ENV=development).
 */
export function isDevBypassEnabled(): boolean {
  if (process.env.DEV_BYPASS_AUTH !== "true") return false;
  if (process.env.NODE_ENV === "production") return false;
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production" || vercelEnv === "preview") return false;
  // Defense-in-depth: require a POSITIVE dev signal rather than only the absence
  // of prod signals — on non-Vercel hosts (Railway `next start`, Electron) NODE_ENV
  // is the sole guard and `next start` only defaults it to production when unset.
  if (process.env.NODE_ENV !== "development" && vercelEnv !== "development") return false;
  return true;
}

/**
 * Returns the owner ID to use during a dev bypass session.
 * Prefer DEV_BYPASS_OWNER_ID env var if set; falls back to DEV_BYPASS_STUB_OWNER_ID.
 */
export function devBypassOwnerId(): string {
  return process.env.DEV_BYPASS_OWNER_ID ?? DEV_BYPASS_STUB_OWNER_ID;
}
