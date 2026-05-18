import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Sentry server-side init (Node.js runtime).
  // Fail-soft: if SENTRY_DSN is absent, skip init entirely — no crash.
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === undefined
  ) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      // Capture 10 % of traces in production, 100 % in dev.
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      // Do not send personal data by default.
      sendDefaultPii: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      sendDefaultPii: false,
    });
  }
}
