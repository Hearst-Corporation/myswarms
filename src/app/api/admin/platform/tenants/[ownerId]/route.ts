import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { getTenantDetail } from "@/lib/platform-admin/data";
import { getGovernanceActions } from "@/lib/platform-admin/governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/platform/tenants/[ownerId]
 * Détail complet d'un owner (swarms, runs, approvals, incidents, mappings).
 * Admin-only. ownerId est validé (UUID) et utilisé en lecture seule — jamais
 * spoofable côté écriture (aucune mutation ici).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ownerId: string }> },
): Promise<NextResponse> {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ownerId } = await params;
  if (!ownerId || !UUID_RE.test(ownerId)) {
    return NextResponse.json({ error: "Invalid owner id" }, { status: 400 });
  }

  try {
    const detail = await getTenantDetail(ownerId);
    if (!detail) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    return NextResponse.json({ detail, governanceActions: getGovernanceActions() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tenant detail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
