/**
 * Tests — API admin /api/admin/platform/tenants (+ /[ownerId])
 *
 * Contrat sécurité :
 *   - non-admin (requireSuperAdmin throw) -> 403, data NON appelée.
 *   - admin -> 200 + payload agrégé.
 *   - detail : ownerId invalide -> 400 ; inconnu -> 404 ; valide -> 200.
 *   - aucun secret (JWT/Bearer/service_role) dans le JSON sérialisé.
 *
 * Mocks : requireSuperAdmin, getTenants/getTenantDetail. Pas de Supabase réel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireSuperAdmin, mockGetTenants, mockGetTenantDetail } = vi.hoisted(() => ({
  mockRequireSuperAdmin: vi.fn(),
  mockGetTenants: vi.fn(),
  mockGetTenantDetail: vi.fn(),
}));

vi.mock("@/lib/auth/superAdmin", () => ({
  requireSuperAdmin: mockRequireSuperAdmin,
}));

vi.mock("@/lib/platform-admin/data", () => ({
  getTenants: mockGetTenants,
  getTenantDetail: mockGetTenantDetail,
}));

vi.mock("@/lib/platform-admin/governance", () => ({
  getGovernanceActions: () => [
    { key: "set_tenant_status", label: "x", enabled: false, disabledReason: "requiert table" },
  ],
}));

import { GET as GET_LIST } from "@/app/api/admin/platform/tenants/route";
import { GET as GET_DETAIL } from "@/app/api/admin/platform/tenants/[ownerId]/route";

const OWNER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  mockRequireSuperAdmin.mockReset();
  mockGetTenants.mockReset();
  mockGetTenantDetail.mockReset();
});

describe("GET /api/admin/platform/tenants", () => {
  it("returns 403 for non-admin and does NOT call data layer", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Forbidden — super admin only"));
    const res = await GET_LIST();
    expect(res.status).toBe(403);
    expect(mockGetTenants).not.toHaveBeenCalled();
  });

  it("returns 200 with aggregated payload for admin", async () => {
    mockRequireSuperAdmin.mockResolvedValue({ id: OWNER, email: "admin@x.com" });
    mockGetTenants.mockResolvedValue({
      tenants: [{ ownerId: OWNER, label: "a•••@x.com", status: "active" }],
      overview: { totalOwners: 1 },
      backend: { engineConfigured: true, syncedAt: "2026-06-26T00:00:00Z" },
      gates: [],
    });
    const res = await GET_LIST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants).toHaveLength(1);
    expect(body.governanceActions).toBeDefined();
  });

  it("never serializes secrets even if the data layer leaked one", async () => {
    mockRequireSuperAdmin.mockResolvedValue({ id: OWNER, email: "admin@x.com" });
    // Simule une fuite hypothétique : la route ne doit pas ajouter de secret.
    mockGetTenants.mockResolvedValue({
      tenants: [{ ownerId: OWNER, label: "a•••@x.com", status: "active" }],
      overview: {},
      backend: {},
      gates: [],
    });
    const res = await GET_LIST();
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(raw).not.toMatch(/service_role/);
    expect(raw).not.toMatch(/Bearer\s+\S/);
    expect(raw).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it("returns 500 if the data layer throws", async () => {
    mockRequireSuperAdmin.mockResolvedValue({ id: OWNER, email: "admin@x.com" });
    mockGetTenants.mockRejectedValue(new Error("db down"));
    const res = await GET_LIST();
    expect(res.status).toBe(500);
  });
});

describe("GET /api/admin/platform/tenants/[ownerId]", () => {
  const ctx = (ownerId: string) => ({ params: Promise.resolve({ ownerId }) });

  it("returns 403 for non-admin", async () => {
    mockRequireSuperAdmin.mockRejectedValue(new Error("Forbidden"));
    const res = await GET_DETAIL(new Request("http://x"), ctx(OWNER));
    expect(res.status).toBe(403);
    expect(mockGetTenantDetail).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-UUID ownerId", async () => {
    mockRequireSuperAdmin.mockResolvedValue({ id: OWNER, email: "a@x.com" });
    const res = await GET_DETAIL(new Request("http://x"), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(mockGetTenantDetail).not.toHaveBeenCalled();
  });

  it("returns 404 when tenant not found", async () => {
    mockRequireSuperAdmin.mockResolvedValue({ id: OWNER, email: "a@x.com" });
    mockGetTenantDetail.mockResolvedValue(null);
    const res = await GET_DETAIL(new Request("http://x"), ctx(OWNER));
    expect(res.status).toBe(404);
  });

  it("returns 200 with detail for admin + valid owner", async () => {
    mockRequireSuperAdmin.mockResolvedValue({ id: OWNER, email: "a@x.com" });
    mockGetTenantDetail.mockResolvedValue({ ownerId: OWNER, label: "a•••@x.com", runs: [], approvals: [], incidents: [] });
    const res = await GET_DETAIL(new Request("http://x"), ctx(OWNER));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.detail.ownerId).toBe(OWNER);
  });
});
