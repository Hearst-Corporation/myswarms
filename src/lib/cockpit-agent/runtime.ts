import { makeThinkStripper } from "@hearst/cockpit-shell/handler";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { dispatchTool, summarizeToolCall, TOOL_SCHEMAS, type ToolContext } from "./tools";

const MAX_TURNS = 6;

export type AgentRunInput = {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  ctx: ToolContext;
  enableTools: boolean;
  /** Appelé pour streamer du texte (status ou contenu final) vers le client. */
  emit: (chunk: string) => void;
};

/**
 * Boucle agent. Renvoie la réponse finale assemblée (à persister).
 * - Tant qu'il y a des tool_calls, on exécute et on relance la complétion (non-stream).
 * - Quand le modèle répond sans tool_calls, on stream la réponse finale.
 * - Les `<think>...</think>` sont strippés en flux.
 */
export async function runAgent(input: AgentRunInput): Promise<string> {
  const { client, model, messages, ctx, enableTools, emit } = input;
  const tools: ChatCompletionTool[] | undefined = enableTools
    ? (TOOL_SCHEMAS as ChatCompletionTool[])
    : undefined;

  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (ctx.signal.aborted) break;

    // Phase 1 : complétion non-streamée pour récupérer d'éventuels tool_calls.
    let completion;
    try {
      completion = await client.chat.completions.create(
        {
          model,
          messages,
          ...(tools ? { tools, tool_choice: "auto" as const } : {}),
          stream: false,
        },
        { signal: ctx.signal },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "LLM error";
      emit(`\n[erreur LLM: ${msg}]`);
      return finalText;
    }

    const choice = completion.choices?.[0];
    const assistantMsg = choice?.message;
    if (!assistantMsg) {
      emit("\n[réponse LLM vide]");
      return finalText;
    }

    const toolCalls = assistantMsg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // Phase 2 : on a la réponse finale → on la "stream" en texte pour rester
      // compatible avec le client cockpit-shell (qui consomme du text/plain).
      const stripThink = makeThinkStripper();
      const content = (assistantMsg.content ?? "").toString();
      const filtered = stripThink(content) + stripThink("");
      finalText = filtered;
      if (filtered) emit(filtered);
      return finalText;
    }

    // Pousse le message assistant (avec tool_calls) dans l'historique.
    messages.push(assistantMsg as ChatCompletionMessageParam);

    // Exécute chaque tool call en séquence (parallèle = trop de risques pour write/run).
    for (const tc of toolCalls) {
      if (tc.type !== "function") continue;
      const label = summarizeToolCall(tc.function.name, tc.function.arguments);
      emit(`\n› ${label}\n`);
      const result = await dispatchTool(tc.function.name, tc.function.arguments, ctx);
      if (!result.ok) emit(`  ✗ ${result.error}\n`);
      else emit(`  ✓\n`);
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result).slice(0, 16_000),
      });
    }
  }

  emit(`\n[limite de ${MAX_TURNS} tours atteinte — affine ta demande]`);
  return finalText;
}
