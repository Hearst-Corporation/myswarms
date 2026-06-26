import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { getTenants } from "@/lib/platform-admin/data";
import { getGovernanceActions } from "@/lib/platform-admin/governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/platform/tenants
 * Liste agrégée des owners/tenants + overview + statut backend + gates.
 * Admin-only (requireSuperAdmin). Aucune donnée brute/secret — tout rédacté
 * en amont par la couche data-access.
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = await getTenants();
    return NextResponse.json({ ...data, governanceActions: getGovernanceActions() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tenants";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
