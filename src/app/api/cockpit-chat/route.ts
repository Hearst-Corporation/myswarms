import { NextRequest, NextResponse } from "next/server";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { getSuperAdmin } from "@/lib/auth/superAdmin";
import { checkRateLimitDistributed } from "@/lib/utils/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { kimi, KIMI_MODEL } from "@/lib/llm/kimi";
import { buildSystemPrompt } from "@/lib/cockpit-agent/prompt";
import { runAgent } from "@/lib/cockpit-agent/runtime";
import type { ToolContext } from "@/lib/cockpit-agent/tools";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Rate-limit coût LLM (boucle agent jusqu'à 6 tours Kimi + tools). Env-driven.
const RL_MAX = Number(process.env.COCKPIT_CHAT_RATELIMIT_MAX ?? "20");
const RL_WINDOW_S = Number(process.env.COCKPIT_CHAT_RATELIMIT_WINDOW_S ?? "60");

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

  const rl = await checkRateLimitDistributed(`cockpit-chat:${ownerId}`, {
    max: RL_MAX,
    windowSeconds: RL_WINDOW_S,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de requêtes — réessaie dans un instant." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
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

  // Capacité dev (FS/shell/SQL) réservée au super-admin — propagée aux tools.
  const canDev = (await getSuperAdmin().catch(() => null)) !== null;

  const admin = createAdminClient();

  // Resolve or create chat
  let chatId = body.chatId;
  if (chatId) {
    // Anti-IDOR : un chatId fourni par le client DOIT appartenir à ownerId.
    // Sans ce contrôle, un user pouvait injecter des messages et exécuter
    // l'agent dans le contexte d'un autre tenant (cf. audit sécu 2026-06-07).
    const { data: owned, error: ownErr } = await admin
      .from("cockpit_chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", ownerId)
      .maybeSingle();
    if (ownErr) {
      return NextResponse.json({ error: "Erreur de lecture de la conversation" }, { status: 500 });
    }
    if (!owned) {
      return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
    }
  } else {
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

  // Persist user message — l'échec bloque la requête (pas d'appel LLM sur état incohérent).
  const { error: userMsgErr } = await admin.from("cockpit_messages").insert({
    chat_id: chatId,
    role: "user",
    content: userMessage,
  });
  if (userMsgErr) {
    return NextResponse.json({ error: "Impossible d'enregistrer le message" }, { status: 500 });
  }

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
    canDev,
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
