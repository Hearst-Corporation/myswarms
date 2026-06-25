/**
 * Tests for src/lib/auth/devBypass.ts — single source of truth for dev bypass.
 *
 * Covers the full matrix of environment variable combinations to ensure
 * isDevBypassEnabled() is fail-closed on any deployed environment
 * (Vercel prod, Vercel preview, NODE_ENV=production) and only allows bypass
 * in genuine local development.
 */
import { describe, it, expect, afterEach } from "vitest";

// Save the original env so we can restore it after each test.
const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>): void {
  // Reset to original first, then apply overrides.
  for (const key of ["DEV_BYPASS_AUTH", "NODE_ENV", "VERCEL_ENV", "DEV_BYPASS_OWNER_ID"]) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

afterEach(() => {
  // Restore env after every test.
  for (const key of ["DEV_BYPASS_AUTH", "NODE_ENV", "VERCEL_ENV", "DEV_BYPASS_OWNER_ID"]) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
});

// We import the module AFTER setting up the env restore, since devBypass.ts
// reads process.env at call-time (not module-load-time), so a static import
// is fine — the functions will see the current process.env values each call.
import {
  isDevBypassEnabled,
  devBypassOwnerId,
  DEV_BYPASS_STUB_OWNER_ID,
} from "@/lib/auth/devBypass";

describe("isDevBypassEnabled()", () => {
  it("returns false when DEV_BYPASS_AUTH is not set", () => {
    setEnv({ DEV_BYPASS_AUTH: undefined, NODE_ENV: "development", VERCEL_ENV: undefined });
    expect(isDevBypassEnabled()).toBe(false);
  });

  it("returns false when DEV_BYPASS_AUTH is 'false'", () => {
    setEnv({ DEV_BYPASS_AUTH: "false", NODE_ENV: "development", VERCEL_ENV: undefined });
    expect(isDevBypassEnabled()).toBe(false);
  });

  it("returns false when NODE_ENV is 'production' (even with DEV_BYPASS_AUTH=true)", () => {
    setEnv({ DEV_BYPASS_AUTH: "true", NODE_ENV: "production", VERCEL_ENV: undefined });
    expect(isDevBypassEnabled()).toBe(false);
  });

  it("returns false when VERCEL_ENV is 'production' (even with DEV_BYPASS_AUTH=true and non-prod NODE_ENV)", () => {
    // Vercel sets NODE_ENV=production on all deployments, but to be safe also
    // test with NODE_ENV=development to show VERCEL_ENV alone closes bypass.
    setEnv({ DEV_BYPASS_AUTH: "true", NODE_ENV: "development", VERCEL_ENV: "production" });
    expect(isDevBypassEnabled()).toBe(false);
  });

  it("returns false when VERCEL_ENV is 'preview' (even with DEV_BYPASS_AUTH=true)", () => {
    setEnv({ DEV_BYPASS_AUTH: "true", NODE_ENV: "development", VERCEL_ENV: "preview" });
    expect(isDevBypassEnabled()).toBe(false);
  });

  it("returns true in local dev: DEV_BYPASS_AUTH=true + NODE_ENV=development + no VERCEL_ENV", () => {
    setEnv({ DEV_BYPASS_AUTH: "true", NODE_ENV: "development", VERCEL_ENV: undefined });
    expect(isDevBypassEnabled()).toBe(true);
  });

  it("returns true when DEV_BYPASS_AUTH=true and VERCEL_ENV='development' (vercel dev locally)", () => {
    // `vercel dev` locally sets VERCEL_ENV=development and NODE_ENV=development.
    setEnv({ DEV_BYPASS_AUTH: "true", NODE_ENV: "development", VERCEL_ENV: "development" });
    expect(isDevBypassEnabled()).toBe(true);
  });

  // ── P2 regression lock: positive-dev-signal gate ──────────────────────────

  it("returns false when DEV_BYPASS_AUTH=true but NODE_ENV and VERCEL_ENV are both unset (Railway/Electron prod hole)", () => {
    // This is the previously-reachable production hole: on Railway `next start`
    // or Electron builds, VERCEL_ENV is never set. If NODE_ENV is also unset
    // (not defaulted to "production" yet) the old absence-only checks would pass.
    // The positive-dev-signal gate must close it.
    setEnv({ DEV_BYPASS_AUTH: "true", NODE_ENV: undefined, VERCEL_ENV: undefined });
    expect(isDevBypassEnabled()).toBe(false);
  });

  it("returns false when DEV_BYPASS_AUTH='TRUE' (uppercase — strict equality required)", () => {
    // Strict string equality: only the lowercase literal "true" is accepted.
    setEnv({ DEV_BYPASS_AUTH: "TRUE", NODE_ENV: "development", VERCEL_ENV: undefined });
    expect(isDevBypassEnabled()).toBe(false);
  });

  it("returns false when DEV_BYPASS_AUTH='1' (non-string-true value)", () => {
    setEnv({ DEV_BYPASS_AUTH: "1", NODE_ENV: "development", VERCEL_ENV: undefined });
    expect(isDevBypassEnabled()).toBe(false);
  });
});

describe("devBypassOwnerId()", () => {
  it("returns DEV_BYPASS_STUB_OWNER_ID when DEV_BYPASS_OWNER_ID is not set", () => {
    setEnv({ DEV_BYPASS_OWNER_ID: undefined });
    expect(devBypassOwnerId()).toBe(DEV_BYPASS_STUB_OWNER_ID);
    expect(devBypassOwnerId()).toBe("00000000-0000-0000-0000-000000000000");
  });

  it("returns the custom DEV_BYPASS_OWNER_ID when set", () => {
    const customId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    setEnv({ DEV_BYPASS_OWNER_ID: customId });
    expect(devBypassOwnerId()).toBe(customId);
  });
});
