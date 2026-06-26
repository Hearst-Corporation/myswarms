/**
 * Tests — src/lib/platform-admin/data.ts : non-fuite de secret/contenu.
 *
 * Mocke createAdminClient avec un query builder Supabase chaînable qui renvoie
 * des runs portant des secrets (JWT dans error_text, trace id, result_text).
 * Vérifie que getRuns() rédacte tout et n'expose AUCUN secret ni prompt brut.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// server-only lève hors d'un Server Component — neutralisé en test.
vi.mock("server-only", () => ({}));

const LEAK_JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsZWFrIn0.abcdefghijklmnopqrstuvwxyz123456";

const OWNER = "11111111-1111-1111-1111-111111111111";

/** Données de test indexées par table, renvoyées par le builder mock. */
const TABLE_DATA: Record<string, unknown[]> = {
  swarm_runs: [
    {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      swarm_id: "ssssssss-0000-0000-0000-000000000001",
      status: "failed",
      started_at: "2026-06-26T10:00:00Z",
      finished_at: "2026-06-26T10:01:00Z",
      created_at: "2026-06-26T10:00:00Z",
      // secret injecté dans le message d'erreur :
      error_text: `TimeoutError: connect failed Bearer ${LEAK_JWT}`,
      langfuse_trace_id: "trace-abcdef1234567890",
    },
  ],
  chief_run_log: [
    {
      id: "bbbbbbbb-0000-0000-0000-000000000001",
      kickoff_id: "kickoff-xyz-0001",
      status: "completed",
      started_at: "2026-06-26T09:00:00Z",
      finished_at: "2026-06-26T09:05:00Z",
      error_text: null,
      langfuse_trace_id: null,
    },
  ],
  swarms: [{ id: "ssssssss-0000-0000-0000-000000000001", name: "My Swarm" }],
};

/** Query builder chaînable minimal : .select().eq().order().limit() -> {data}. */
function makeBuilder(table: string) {
  const result = { data: TABLE_DATA[table] ?? [], error: null, count: (TABLE_DATA[table] ?? []).length };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.eq = chain;
  builder.in = chain;
  builder.gte = chain;
  builder.order = chain;
  builder.limit = () => Promise.resolve(result);
  // pour les appels .select(..).eq(..).eq(..).gte(..) sans .limit() terminal
  // (count head:true) -> thenable :
  (builder as { then?: unknown }).then = (resolve: (v: unknown) => void) => resolve(result);
  return builder;
}

const mockAdmin = {
  from: (table: string) => makeBuilder(table),
  auth: { admin: { listUsers: vi.fn(), getUserById: vi.fn() } },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdmin,
}));

import { getRuns } from "@/lib/platform-admin/data";

beforeEach(() => {
  // owner-scoped runs path uses env mappings; clear to avoid noise
});

describe("getRuns redaction", () => {
  it("redacts secrets in error_text and shortens trace id", async () => {
    const runs = await getRuns(OWNER, 40);
    const raw = JSON.stringify(runs);

    // Aucun secret ne doit apparaître.
    expect(raw).not.toContain(LEAK_JWT);
    expect(raw).not.toMatch(/Bearer\s+ey/);

    const failed = runs.find((r) => r.status === "failed");
    expect(failed).toBeDefined();
    // error_text réduit à la classe d'erreur, pas le message complet.
    expect(failed!.errorClass).toBe("TimeoutError");
    // trace id raccourci (8 chars + ellipsis), pas la valeur complète.
    expect(failed!.traceId).toBe("trace-ab…");
    expect(failed!.runId).toBe("aaaaaaaa…");
  });

  it("never includes a raw prompt preview by default (default-deny)", async () => {
    const runs = await getRuns(OWNER, 40);
    for (const r of runs) {
      expect(r.promptPreviewRedacted).toBeUndefined();
    }
  });

  it("merges swarm and chief runs", async () => {
    const runs = await getRuns(OWNER, 40);
    expect(runs.some((r) => r.source === "swarm")).toBe(true);
    expect(runs.some((r) => r.source === "chief")).toBe(true);
  });
});
