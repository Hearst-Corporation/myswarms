import { NextResponse } from "next/server";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Params { params: Promise<{ chatId: string }> }

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  let ownerId: string;
  try { ownerId = await requireOwnerId(); }
  catch (err) {
    if (err instanceof OwnerAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { chatId } = await params;
  const admin = createAdminClient();
  const { data: chat, error: chatErr } = await admin
    .from("cockpit_chats")
    .select("id, title, created_at")
    .eq("id", chatId)
    .eq("user_id", ownerId)
    .single();
  if (chatErr || !chat) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: messages, error: msgErr } = await admin
    .from("cockpit_messages")
    .select("id, role, content, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });
  return NextResponse.json({ ...chat, messages: messages ?? [] });
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  let ownerId: string;
  try { ownerId = await requireOwnerId(); }
  catch (err) {
    if (err instanceof OwnerAuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { chatId } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("cockpit_chats").delete().eq("id", chatId).eq("user_id", ownerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
