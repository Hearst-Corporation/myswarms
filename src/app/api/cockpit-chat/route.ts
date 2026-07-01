import { NextResponse } from "next/server";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { kimiClient, KIMI_MODEL } from "@/lib/llm/kimi";
import { runAgent } from "@/lib/cockpit-agent/runtime";
import { buildSystemPrompt } from "@/lib/cockpit-agent/prompt";
import type { ToolContext } from "@/lib/cockpit-agent/tools";
import { getOwnerId } from "@/lib/auth/owner";
import { getSuperAdmin } from "@/lib/auth/superAdmin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IncomingMessage = { role: "user" | "assistant" | "system"; content: string };

/**
 * POST /api/cockpit-chat — endpoint du chat Kimi (rail droit).
 * Assemble auth + tools + system prompt + boucle agent, puis stream la réponse
 * en text/plain (compatible client cockpit-shell useChat).
 *
 * Body : { messages: {role, content}[] }
 * - Un super-admin obtient les tools « dev » (FS/shell/SQL) ; un user standard
 *   n'a que les tools métier (automobile). canDev = fail-closed.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { messages?: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "messages requis" }, { status: 400 });
  }

  const [ownerId, superAdmin, supabase] = await Promise.all([
    getOwnerId(),
    getSuperAdmin(),
    createClient(),
  ]);

  const canDev = superAdmin !== null;
  const enableTools = true;

  const ctx: ToolContext = {
    supabase,
    signal: req.signal,
    ownerId,
    canDev,
  };

  const systemPrompt = buildSystemPrompt({ hasTools: enableTools });

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...incoming
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller déjà fermé (client parti) — ignore
        }
      };
      try {
        await runAgent({
          client: kimiClient,
          model: KIMI_MODEL,
          messages,
          ctx,
          enableTools,
          emit,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur agent";
        emit(`\n[erreur: ${msg}]`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
