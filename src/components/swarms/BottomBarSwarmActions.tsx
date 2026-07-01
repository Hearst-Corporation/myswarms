"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface BottomBarSwarmActionsProps {
  swarmId: string;
}

/**
 * Action "Run" contextuelle pour la page /swarms/[id] (barre d'actions du
 * PageHeader). Kickoff le swarm en mode on_demand puis redirige vers la page
 * run créée.
 *
 * Découplé pour ne pas mélanger logique de navigation (Link) et logique async
 * (fetch + push) dans le même composant.
 */
export function BottomBarSwarmActions({ swarmId }: BottomBarSwarmActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/swarms/${swarmId}/kickoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "on_demand" }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status} — ${body}`);
      }
      const { run_id: runId } = (await res.json()) as { run_id: string };
      router.push(`/swarms/${swarmId}/runs/${runId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        onClick={handleRun}
        disabled={busy}
        aria-disabled={busy}
        title="Trigger an on_demand run"
      >
        {busy ? "Run…" : "Run"}
      </Button>
      {error && (
        <p
          role="alert"
          className="max-w-60 text-right text-[10px] text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
