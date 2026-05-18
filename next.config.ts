import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // -----------------------------------------------------------------------
  // Sentry build-time options
  // -----------------------------------------------------------------------

  // Silent Sentry CLI output unless there is an error.
  silent: !process.env.CI,

  // Source map upload is DISABLED intentionally.
  // WHY: The SENTRY_AUTH_TOKEN currently returns 403 (token needs to be
  // regenerated in the Sentry dashboard). Enabling upload would cause
  // `npm run build` to fail. Re-enable by removing the block below once
  // a valid token is available.
  sourcemaps: {
    disable: true,
  },

  // Disable the automatic Sentry release creation (also requires auth token).
  release: {
    create: false,
    finalize: false,
  },

  // Disable automatic instrumentation helpers injection — we use our own
  // instrumentation.ts / instrumentation-client.ts files (Next 16 convention).
  // Using nested webpack.* keys (new API) to avoid deprecation warnings.
  webpack: {
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false,
  },
});
