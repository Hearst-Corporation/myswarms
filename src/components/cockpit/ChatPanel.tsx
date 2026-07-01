"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PaperAirplaneIcon, StopIcon, TrashIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/ui/cn";

type Role = "user" | "assistant";
type Message = { id: string; role: Role; content: string };

const CHAT_ENDPOINT = "/api/cockpit-chat";

let idSeq = 0;
const nextId = () => `m${++idSeq}`;

/**
 * Chat Kimi — rail droit. Parle à /api/cockpit-chat (streaming text/plain).
 * Autonome : gère son état, le streaming et l'annulation. DS MySwarms.
 */
export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { id: nextId(), role: "user", content: text };
    const assistantMsg: Message = { id: nextId(), role: "assistant", content: "" };
    const history = [...messages, userMsg];
    setMessages([...history, assistantMsg]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: acc } : m)),
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: m.content + "\n[interrompu]" }
              : m,
          ),
        );
      } else {
        const msg = err instanceof Error ? err.message : "Erreur réseau";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: `[erreur: ${msg}]` } : m,
          ),
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, messages]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    if (streaming) return;
    setMessages([]);
  }, [streaming]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* En-tête */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-sm font-semibold text-content-strong">Kimi</span>
        </div>
        <button
          type="button"
          onClick={clear}
          disabled={streaming || messages.length === 0}
          aria-label="Effacer la conversation"
          title="Effacer"
          className="rounded-md p-1.5 text-content-muted transition-colors hover:bg-surface-2 hover:text-content disabled:pointer-events-none disabled:opacity-40"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-content-muted">
              Assistant admin du projet
            </p>
            <p className="mt-1 max-w-[16rem] text-xs text-content-faint">
              Pose une question sur MySwarms, lance une analyse, ou demande une action.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--radius-md)] px-3 py-2 text-sm",
                  m.role === "user"
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-content ring-1 ring-inset ring-line",
                )}
              >
                {m.content || (
                  <span className="inline-flex gap-1" aria-label="En cours">
                    <span className="size-1.5 animate-pulse rounded-full bg-current" />
                    <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
                    <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message à Kimi…"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-sm text-content ring-1 ring-inset ring-line placeholder:text-content-faint focus:ring-2 focus:ring-inset focus:ring-accent focus:outline-none"
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Arrêter"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-surface-3 text-content ring-1 ring-inset ring-line hover:bg-elevated"
            >
              <StopIcon className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!input.trim()}
              aria-label="Envoyer"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent text-white hover:bg-accent-strong disabled:pointer-events-none disabled:opacity-40"
            >
              <PaperAirplaneIcon className="size-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
