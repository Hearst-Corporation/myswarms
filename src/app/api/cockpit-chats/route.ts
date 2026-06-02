import { NextResponse } from "next/server";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let ownerId: string;
  try { ownerId = await requireOwnerId(); }
  catch (err) {
    if (err instanceof OwnerAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cockpit_chats")
    .select("id, title, created_at")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function DELETE(): Promise<Response> {
  let ownerId: string;
  try { ownerId = await requireOwnerId(); }
  catch (err) {
    if (err instanceof OwnerAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const admin = createAdminClient();
  const { error } = await admin.from("cockpit_chats").delete().eq("user_id", ownerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
