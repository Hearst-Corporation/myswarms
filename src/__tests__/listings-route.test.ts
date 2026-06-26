/**
 * Test — API /api/listings BFF proxy (owner-scope, audit High #2)
 *
 * Tests the route handler at src/app/api/listings/route.ts.
 * Mocks: listingsClient, requireOwnerId. No real network, no Supabase, no engine.
 *
 * Contract:
 *   - No Supabase session (OwnerAuthError) → 401, listingsClient NOT called.
 *   - Valid session → owner propagated to listingsClient.search → 200.
 *   - Bad JSON / Zod validation → 400.
 *   - Engine 4xx → propagated; engine 5xx / unknown → 502.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockSearch, mockRequireOwnerId } = vi.hoisted(() => ({
  mockSearch: vi.fn(),
  mockRequireOwnerId: vi.fn(),
}));

vi.mock("@/lib/crewai/listings", async () => {
  const { z } = await import("zod");
  class ListingsEngineError extends Error {
    readonly status: number;
    readonly path: string;
    constructor(status: number, path: string, message: string) {
      super(message);
      this.name = "ListingsEngineError";
      this.status = status;
      this.path = path;
    }
  }
  return {
    ListingsEngineError,
    listingsClient: { search: mockSearch },
    // Re-export a real schema so the route's safeParse behaves realistically.
    ListingsQuerySchema: z.object({
      ville: z.string().min(1).max(120).optional(),
      codePostal: z.string().min(1).max(10).optional(),
      typeBien: z.enum(["appartement", "maison"]).optional(),
      surface: z.number().positive().max(100000).optional(),
      nbPieces: z.number().positive().max(50).optional(),
    }),
  };
});

vi.mock("@/lib/auth/owner", () => ({
  requireOwnerId: mockRequireOwnerId,
  OwnerAuthError: class OwnerAuthError extends Error {},
}));

import { POST } from "@/app/api/listings/route";
import { ListingsEngineError } from "@/lib/crewai/listings";
import { OwnerAuthError } from "@/lib/auth/owner";

const OWNER = "11111111-1111-1111-1111-111111111111";

function makeRequest(body: unknown): NextRequest {
  const serialized = JSON.stringify(body);
  return new NextRequest("http://localhost/api/listings", {
    method: "POST",
    body: serialized,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(serialized, "utf8")),
    },
  });
}

describe("POST /api/listings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireOwnerId.mockResolvedValue(OWNER);
  });

  it("returns 401 and does NOT call the engine when there is no session", async () => {
    mockRequireOwnerId.mockRejectedValue(new OwnerAuthError("no session"));
    const res = await POST(makeRequest({ ville: "Paris" }));
    expect(res.status).toBe(401);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("returns 400 on unparseable JSON body", async () => {
    const req = new NextRequest("http://localhost/api/listings", {
      method: "POST",
      body: "NOT JSON",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength("NOT JSON", "utf8")),
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on Zod validation failure (bad typeBien)", async () => {
    const res = await POST(makeRequest({ typeBien: "chateau" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
  });

  it("propagates owner to the engine and returns 200 on success", async () => {
    mockSearch.mockResolvedValue({ listings: [{ id: "x1" }] });
    const res = await POST(makeRequest({ ville: "Paris", typeBien: "appartement" }));
    expect(res.status).toBe(200);
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ ville: "Paris", typeBien: "appartement" }),
      OWNER,
    );
    const body = await res.json();
    expect(body.listings[0].id).toBe("x1");
  });

  it("returns 502 when the engine throws", async () => {
    mockSearch.mockRejectedValue(
      new ListingsEngineError(503, "/v1/listings", "Service unavailable"),
    );
    const res = await POST(makeRequest({ ville: "Lyon" }));
    expect(res.status).toBe(502);
  });
});
