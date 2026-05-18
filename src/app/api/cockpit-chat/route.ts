import { createCockpitChatHandler } from "@hearst/cockpit-shell/handler";
import type { ChatPersistence, ChatMessage } from "@hearst/cockpit-shell";
import { kimi, KIMI_MODEL } from "@/lib/llm/kimi";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Implémentation ChatPersistence branché sur Supabase.
 *
 * Le client Supabase (et l'identité user) est résolu de façon lazy à chaque
 * appel de méthode — la route est Node, pas Edge, ce qui permet l'async
 * sans contrainte. RLS assure l'isolation par user côté DB.
 *
 * En cas d'erreur Supabase, les méthodes ne lèvent PAS d'exception : un
 * échec de persistance ne doit pas bloquer le stream LLM.
 */
const cockpitPersistence: ChatPersistence = {
  async createChat(): Promise<string> {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

  async saveMessage(chatId: string, msg: ChatMessage): Promise<void> {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

  async loadMessages(chatId: string): Promise<ChatMessage[]> {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("cockpit_messages")
        .select("id, role, content, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error || !data) return [];

      return data.map((row) => ({
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

export const { POST } = createCockpitChatHandler({
  llmClient: kimi,
  model: KIMI_MODEL,
  systemPrompt:
    "Tu es l'assistant Kimi intégré à Hearst Hive — builder visuel de swarms multi-agents & Daily Chief of Staff. Réponds en français.",
  persistence: cockpitPersistence,
});
