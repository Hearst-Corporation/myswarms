/**
 * Tests for src/lib/platform-admin/redaction.ts
 *
 * Vérifie qu'aucun secret ni contenu privé ne peut transiter vers l'UI admin :
 * JWT, Bearer, sk-, service_role, tokens Telegram, prompts non rédactés.
 */
import { describe, it, expect } from "vitest";
import {
  redactSecret,
  containsSecret,
  shortId,
  maskEmail,
  redactPromptPreview,
  redactError,
  redactOwnerId,
  shortTraceId,
} from "../redaction";

const SAMPLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

describe("redactSecret", () => {
  it("redacts full JWT", () => {
    const out = redactSecret(`token=${SAMPLE_JWT}`);
    expect(out).not.toContain(SAMPLE_JWT);
    expect(out).toContain("[REDACTED_JWT]");
  });

  it("redacts truncated JWT header eyJ…", () => {
    const out = redactSecret("Authorization eyJabcdefghijklmnop");
    expect(out).not.toMatch(/eyJabcdef/);
    expect(out).toContain("[REDACTED_JWT]");
  });

  it("redacts Bearer tokens", () => {
    const out = redactSecret("Authorization: Bearer abc.def.ghi-jkl_mno");
    expect(out).toContain("Bearer [REDACTED]");
    expect(out).not.toContain("abc.def.ghi");
  });

  it("redacts sk- keys (openai/anthropic/proj)", () => {
    expect(redactSecret("sk-proj-ABCDEFGHIJKLMNOP")).toContain("[REDACTED_KEY]");
    expect(redactSecret("key sk-ant-12345678901234")).not.toContain("sk-ant-1234");
  });

  it("redacts service_role mentions", () => {
    expect(redactSecret("using service_role key")).toContain("[REDACTED_ROLE]");
    expect(redactSecret("SERVICE_ROLE leaked")).not.toMatch(/SERVICE_ROLE/);
  });

  // NB : toutes les valeurs ci-dessous sont SYNTHÉTIQUES (jamais un vrai token) —
  // on teste les patterns de redaction, pas une valeur réelle.
  it("redacts Composio ak_ keys", () => {
    expect(redactSecret("ak_0000000000000000000")).toContain("[REDACTED_KEY]");
  });

  it("redacts Telegram bot tokens", () => {
    expect(redactSecret("bot 123456789:AAAA00000000000000000000")).toContain("[REDACTED_TOKEN]");
  });

  it("redacts Hypercli keys", () => {
    expect(redactSecret("hyper_api_AAAABBBBCCCCDDDDEEEE")).toContain("[REDACTED_KEY]");
  });

  it("redacts provider key prefixes without clean format", () => {
    expect(redactSecret("ghp_0000000000000000000000000000000000")).toContain("[REDACTED_KEY]");
    expect(redactSecret("vcp_00000000000000000000000000000000")).toContain("[REDACTED_KEY]");
    expect(redactSecret("cfat_0000000000000000000000000000000000")).toContain("[REDACTED_KEY]");
    expect(redactSecret("re_0000000000000000000000000000")).toContain("[REDACTED_KEY]");
    expect(redactSecret("xaat-00000000-0000-0000-0000-000000000000")).toContain("[REDACTED_KEY]");
    expect(redactSecret("signkey-test-00000000000000000000000000000000")).toContain("[REDACTED_KEY]");
  });

  it("redacts ElevenLabs sk_ (underscore) keys", () => {
    expect(redactSecret("sk_0000000000000000000000000000000000000000")).toContain("[REDACTED_KEY]");
  });

  it("redacts secrets passed in URL query strings", () => {
    expect(redactSecret("GET https://api.x.com/v1?api_key=supersecret123&x=1")).toContain("api_key=[REDACTED]");
    expect(redactSecret("url?token=abc.def.ghi failed")).toContain("token=[REDACTED]");
    expect(redactSecret("?access_token=zzz")).toContain("access_token=[REDACTED]");
  });

  it("returns empty string for null/undefined", () => {
    expect(redactSecret(null)).toBe("");
    expect(redactSecret(undefined)).toBe("");
  });

  it("leaves plain text intact", () => {
    expect(redactSecret("hello world run failed")).toBe("hello world run failed");
  });
});

describe("containsSecret", () => {
  it("detects a JWT", () => {
    expect(containsSecret(SAMPLE_JWT)).toBe(true);
  });
  it("detects service_role", () => {
    expect(containsSecret("x service_role y")).toBe(true);
  });
  it("is false for clean text", () => {
    expect(containsSecret("clean status text")).toBe(false);
    expect(containsSecret("")).toBe(false);
    expect(containsSecret(null)).toBe(false);
  });
});

describe("shortId / redactOwnerId", () => {
  it("truncates a UUID to 8 chars + ellipsis", () => {
    expect(shortId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400…");
    expect(redactOwnerId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400…");
  });
  it("returns dash for empty", () => {
    expect(shortId(null)).toBe("—");
    expect(shortId("")).toBe("—");
  });
  it("keeps short ids whole", () => {
    expect(shortId("abc123")).toBe("abc123");
  });
});

describe("maskEmail", () => {
  it("masks the local part, keeps domain", () => {
    const out = maskEmail("adrien@gmail.com");
    expect(out).toMatch(/^a•+@gmail\.com$/);
    expect(out).not.toContain("adrien@");
  });
  it("returns undefined for empty", () => {
    expect(maskEmail(undefined)).toBeUndefined();
  });
  it("handles malformed input safely", () => {
    expect(maskEmail("notanemail")).toBe("•••");
  });
});

describe("redactPromptPreview", () => {
  it("returns undefined when disabled (default-deny)", () => {
    expect(redactPromptPreview("some prompt", false)).toBeUndefined();
  });
  it("returns undefined for empty even when allowed", () => {
    expect(redactPromptPreview("", true)).toBeUndefined();
    expect(redactPromptPreview(null, true)).toBeUndefined();
  });
  it("redacts secrets inside an allowed preview", () => {
    const out = redactPromptPreview(`do X with ${SAMPLE_JWT}`, true);
    expect(out).toBeDefined();
    expect(out).not.toContain(SAMPLE_JWT);
  });
  it("truncates long previews to <= 121 chars", () => {
    const long = "a".repeat(500);
    const out = redactPromptPreview(long, true)!;
    expect(out.length).toBeLessThanOrEqual(PROMPT_MAX_WITH_ELLIPSIS);
    expect(out.endsWith("…")).toBe(true);
  });
});
const PROMPT_MAX_WITH_ELLIPSIS = 121;

describe("redactError", () => {
  it("reduces to the Error class name", () => {
    expect(redactError("TimeoutError: connect ETIMEDOUT 1.2.3.4")).toBe("TimeoutError");
  });
  it("strips secrets from non-classed errors", () => {
    const out = redactError(`failed Bearer ${SAMPLE_JWT}`)!;
    expect(out).not.toContain(SAMPLE_JWT);
  });
  it("returns undefined for empty", () => {
    expect(redactError(null)).toBeUndefined();
    expect(redactError("")).toBeUndefined();
  });
});

describe("shortTraceId", () => {
  it("shortens a trace id", () => {
    expect(shortTraceId("abcdef1234567890")).toBe("abcdef12…");
  });
  it("undefined when absent", () => {
    expect(shortTraceId(undefined)).toBeUndefined();
  });
});
