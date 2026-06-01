"use client";

import { useState } from "react";
import { FONT, SPACING, FONT_WEIGHT } from "@/lib/ui/tokens";

interface ConnectButtonProps {
  toolkit: string; // "gmail" | "trello"
  label: string;   // "Gmail" | "Trello"
}

export function ConnectButton({ toolkit, label }: ConnectButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleConnect() {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/sources/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { redirect_url: string };
      window.open(data.redirect_url, "_blank", "noopener,noreferrer");
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inconnue");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <span
        style={{
          fontSize: FONT.xs,
          color: "var(--ct-status-success)",
          fontWeight: FONT_WEIGHT.bold,
        }}
      >
        ✓ Fenêtre OAuth ouverte
      </span>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: SPACING.xs,
      }}
    >
      <button
        type="button"
        className="ct-seg-btn primary"
        onClick={handleConnect}
        disabled={status === "loading"}
        style={{
          fontSize: FONT.xs,
          padding: `${SPACING.xs}px ${SPACING.md}px`,
        }}
      >
        {status === "loading" ? "…" : `Connecter ${label}`}
      </button>
      {status === "error" && errorMsg && (
        <span
          style={{
            fontSize: FONT.xxs,
            color: "var(--ct-alert-error-text)",
            maxWidth: 200,
            textAlign: "right",
          }}
        >
          {errorMsg}
        </span>
      )}
    </div>
  );
}
