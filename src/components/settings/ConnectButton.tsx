"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

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
      <span className="text-xs font-semibold text-[var(--color-ok)]">
        ✓ Fenêtre OAuth ouverte
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        size="sm"
        onClick={handleConnect}
        disabled={status === "loading"}
      >
        {status === "loading" ? "…" : `Connecter ${label}`}
      </Button>
      {status === "error" && errorMsg && (
        <span className="max-w-[200px] text-right text-[10px] text-danger">
          {errorMsg}
        </span>
      )}
    </div>
  );
}
