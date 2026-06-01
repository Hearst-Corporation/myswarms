import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── DELETE — supprimer un user ────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  // Bloquer la suppression du super admin lui-même
  const { data: { user: self } } = await admin.auth.admin.getUserById(id);
  const allowedEmail = process.env.ALLOWED_EMAIL;
  if (self?.email === allowedEmail) {
    return NextResponse.json({ error: "Cannot delete the super admin account" }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
