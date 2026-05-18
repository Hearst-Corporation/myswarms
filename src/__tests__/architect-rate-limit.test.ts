import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ───────────────────────────────────────────────────────
const { mockCheckRateLimit, mockArchitectGenerate, mockGetOwnerId } = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockArchitectGenerate: vi.fn(),
  mockGetOwnerId: vi.fn(),
}));

// Mock the rate-limit module
vi.mock("@/lib/utils/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// Mock the swarms client
vi.mock("@/lib/crewai/swarms", () => {
  class SwarmEngineError extends Error {}
  return {
    swarmsClient: { architectGenerate: mockArchitectGenerate },
    SwarmEngineError,
  };
});

// Mock auth
vi.mock("@/lib/auth/owner", () => ({
  getOwnerId: mockGetOwnerId,
}));

import { POST } from "@/app/api/swarms/architect/generate/route";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  const serialized = JSON.stringify(body);
  return new Request("http://localhost/api/swarms/architect/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(serialized, "utf8")),
    },
    body: serialized,
  });
}

describe("POST /api/swarms/architect/generate — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOwnerId.mockResolvedValue("test-owner-id");
  });

  it("returns 429 with Retry-After header when rate limit exceeded", async () => {
    mockCheckRateLimit.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 42,
    });

    const res = await POST(makeRequest({ prompt: "create a research swarm" }) as any);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    const body = await res.json();
    expect(body.error).toMatch(/rate limit/i);
    expect(body.retryAfterSeconds).toBe(42);
  });

  it("proceeds to engine when rate limit allows", async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    mockArchitectGenerate.mockResolvedValue({ spec: { name: "test" } } as any);

    const res = await POST(makeRequest({ prompt: "create a research swarm" }) as any);
    expect(res.status).not.toBe(429);
    expect(mockArchitectGenerate).toHaveBeenCalledOnce();
  });
});
