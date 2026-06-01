import { z } from "zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChatMessage, ChatPersistence } from "@hearst/cockpit-shell";
import { kimi, KIMI_MODEL } from "@/lib/llm/kimi";
import { createClient } from "@/lib/supabase/server";
import { traceChatEvent } from "@/lib/observability/langfuse";
import { buildSystemPrompt } from "@/lib/cockpit-agent/prompt";
import { runAgent } from "@/lib/cockpit-agent/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY_MESSAGES = 50;

const BodySchema = z.object({
  chatId: z.string().nullish(),
  message: z.string().min(1, "Message vide"),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.string() }))
    .optional(),
  productId: z.string().nullish(),
  system: z.string().optional(),
});

type RateSlot = { count: number; resetAt: number };
const RATE_STORE = new Map<string, RateSlot>();

function checkRateLimit(key: string, max: number, windowMs: number) {
  if (RATE_STORE.size > 500) {
    const now = Date.now();
    for (const [k, slot] of RATE_STORE) if (now > slot.resetAt) RATE_STORE.delete(k);
  }
  const now = Date.now();
  const slot = RATE_STORE.get(key);
  if (!slot || now > slot.resetAt) {
    RATE_STORE.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfter: 0 };
  }
  slot.count += 1;
  if (slot.count > max) {
    return { limited: true, retryAfter: Math.ceil((slot.resetAt - now) / 1000) };
  }
  return { limited: false, retryAfter: 0 };
}

const cockpitPersistence: ChatPersistence = {
  async createChat() {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return crypto.randomUUID();
      const { data, error } = await supabase
        .from("cockpit_chats")
        .insert({ user_id: user.id })
        .select("id")
        .single();
      if (error || !data) return crypto.randomUUID();
      return data.id;
    } catch {
      return crypto.randomUUID();
    }
  },
  async saveMessage(chatId, msg: ChatMessage) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("cockpit_messages").insert({
        id: msg.id,
        chat_id: chatId,
        role: msg.role,
        content: msg.content,
        created_at: new Date(msg.createdAt).toISOString(),
      });
    } catch {
      // persistance optionnelle — ne pas bloquer le stream
    }
  },
  async loadMessages(chatId) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("cockpit_messages")
        .select("id, role, content, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY_MESSAGES);
      if (error || !data) return [];
      const ordered = [...data].reverse();
      return ordered.map((row) => ({
        id: row.id,
        role: row.role as "user" | "assistant",
        content: row.content,
        createdAt: new Date(row.created_at ?? 0).getTime(),
      }));
    } catch {
      return [];
    }
  },
};

function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const list = (process.env.COCKPIT_ADMIN_EMAILS ?? "adrien@hearstcorporation.io")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

async function buildRunsContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  try {
    const [chief, swarms] = await Promise.all([
      supabase
        .from("chief_run_log")
        .select("id,kickoff_id,status,trigger,started_at,finished_at,error_text")
        .order("started_at", { ascending: false })
        .limit(8),
      supabase
        .from("swarm_runs")
        .select("id,swarm_id,started_at,finished_at,error_text")
        .order("started_at", { ascending: false })
        .limit(8),
    ]);
    const lines: string[] = [];
    if (chief.data?.length) {
      lines.push("Daily Chief of Staff — chief_run_log :");
      for (const r of chief.data) {
        const end = r.finished_at ?? "(en cours)";
        const err = r.error_text ? ` [err: ${r.error_text.slice(0, 120)}]` : "";
        lines.push(`- [${r.status}] trigger=${r.trigger} · ${r.started_at} → ${end} · kickoff=${r.kickoff_id}${err}`);
      }
    }
    if (swarms.data?.length) {
      lines.push("", "Swarm runs — swarm_runs :");
      for (const r of swarms.data) {
        const status = r.error_text ? "error" : r.finished_at ? "ok" : "running";
        const end = r.finished_at ?? "(en cours)";
        const err = r.error_text ? ` [err: ${r.error_text.slice(0, 120)}]` : "";
        lines.push(`- [${status}] swarm=${r.swarm_id} · ${r.started_at} → ${end}${err}`);
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Bad request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const body = parsed.data;
  const message = body.message.trim();
  if (!message) return new Response("Empty message", { status: 400 });

  // Auth + admin gate.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } as { user: null } }));
  const userId = user?.id;
  const enableTools = isAdminEmail(user?.email ?? undefined);

  // Rate-limit (clé user > IP).
  const rateKey = userId
    ?? req.headers.get("x-vercel-forwarded-for")
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
  const { limited, retryAfter } = checkRateLimit(rateKey, enableTools ? 100 : 30, 60_000);
  if (limited) {
    return new Response("Trop de requêtes — réessaie dans quelques instants.", {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    });
  }

  // Persistence : crée ou charge le chat.
  let chatId = body.chatId ?? null;
  const history: ChatCompletionMessageParam[] = [];
  if (!chatId) chatId = await cockpitPersistence.createChat();
  else {
    const loaded = await cockpitPersistence.loadMessages(chatId);
    history.push(...loaded.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam));
  }
  if (chatId) {
    await cockpitPersistence.saveMessage(chatId, {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      createdAt: Date.now(),
    });
  }

  // Contexte runs (best-effort).
  const runsContext = userId ? await buildRunsContext(supabase) : "";
  const systemPrompt = body.system ?? buildSystemPrompt({ hasTools: enableTools, runsContext });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  traceChatEvent({
    name: "cockpit-chat",
    userId,
    model: KIMI_MODEL,
    metadata: { runtime: "nodejs", tools: enableTools, chatId: chatId ?? undefined },
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let assembled = "";
      const emit = (chunk: string) => {
        if (!chunk) return;
        assembled += chunk;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          // controller closed (client gone)
        }
      };
      try {
        await runAgent({
          client: kimi,
          model: KIMI_MODEL,
          messages,
          ctx: { supabase, signal: req.signal },
          enableTools,
          emit,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "agent error";
        emit(`\n[erreur agent: ${msg}]`);
      } finally {
        controller.close();
        if (chatId && assembled.trim()) {
          await cockpitPersistence.saveMessage(chatId, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: assembled,
            createdAt: Date.now(),
          });
        }
      }
    },
    cancel() {
      // signal d'abort déjà propagé via req.signal.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      ...(chatId ? { "x-chat-id": chatId } : {}),
    },
  });
}
