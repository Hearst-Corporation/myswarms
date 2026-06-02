import { NextRequest, NextResponse } from "next/server";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { kimi, KIMI_MODEL } from "@/lib/llm/kimi";
import { buildSystemPrompt } from "@/lib/cockpit-agent/prompt";
import { runAgent } from "@/lib/cockpit-agent/runtime";
import type { ToolContext } from "@/lib/cockpit-agent/tools";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<Response> {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }

  let body: { chatId?: string; message?: string; messages?: ChatCompletionMessageParam[]; model?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const userMessage = (body.message ?? "").trim();
  if (!userMessage) {
    return NextResponse.json({ error: "message requis" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve or create chat
  let chatId = body.chatId;
  if (!chatId) {
    const title = userMessage.slice(0, 60);
    const { data: chat, error: chatErr } = await admin
      .from("cockpit_chats")
      .insert({ user_id: ownerId, title })
      .select("id")
      .single();
    if (chatErr || !chat) {
      return NextResponse.json({ error: "Impossible de créer la conversation" }, { status: 500 });
    }
    chatId = chat.id as string;
  }

  // Persist user message
  await admin.from("cockpit_messages").insert({
    chat_id: chatId,
    role: "user",
    content: userMessage,
  });

  // Build history from prior messages (passed by client) + the new user message
  const history: ChatCompletionMessageParam[] = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt({ hasTools: true }) },
    ...history,
    { role: "user", content: userMessage },
  ];

  // Stream response via TransformStream
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();

  const ctrl = new AbortController();
  req.signal.addEventListener("abort", () => ctrl.abort(), { once: true });

  const ctx: ToolContext = {
    supabase: admin,
    signal: ctrl.signal,
    ownerId,
  };

  const model = body.model ?? KIMI_MODEL;

  // Run agent and persist assistant response
  runAgent({ client: kimi, model, messages, ctx, enableTools: true, emit: (chunk) => {
    writer.write(encoder.encode(chunk)).catch(() => {});
  }}).then(async (finalText) => {
    if (finalText) {
      await admin.from("cockpit_messages").insert({
        chat_id: chatId,
        role: "assistant",
        content: finalText,
      });
    }
    await writer.close().catch(() => {});
  }).catch(async () => {
    await writer.abort().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "x-chat-id": chatId,
      "Cache-Control": "no-cache",
    },
  });
}
