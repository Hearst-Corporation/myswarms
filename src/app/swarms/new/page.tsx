"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SwarmBuilder } from "@/components/swarms/SwarmBuilder";
import type { Tool } from "@/lib/forms/swarmSchemas";
import { Chevron } from "@/components/ui/Chevron";

export default function NewSwarmPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tools", { signal: AbortSignal.timeout(15000) })
      .then((r) => {
        if (!r.ok) throw new Error(`Catalogue indisponible (HTTP ${r.status})`);
        return r.json();
      })
      .then((data: Tool[]) => {
        if (!cancelled) setTools(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error && err.name === "TimeoutError"
            ? "Délai dépassé — moteur CrewAI injoignable."
            : "Impossible de charger les outils.";
        setToolsError(msg);
      })
      .finally(() => {
        if (!cancelled) setToolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <>
      <div className="ct-eyebrow">
        <Link
          href="/swarms"
          style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}
        >
          <Chevron direction="left" />Swarms
        </Link>
      </div>
      <h1 className="ct-title">Nouveau swarm</h1>
      <p className="ct-sub">
        Définis le nom, les agents, les tâches et les outils. Tu pourras éditer
        après création.
      </p>

      {toolsLoading ? (
        <div className="ct-card" aria-busy="true" aria-live="polite">
          <div className="ct-card-title">Chargement des outils…</div>
          <div className="ct-placeholder">
            Récupération du catalogue depuis le moteur CrewAI.
          </div>
        </div>
      ) : toolsError ? (
        <div
          className="ct-card"
          role="alert"
          style={{
            background: "var(--ct-alert-warning-bg)",
            borderColor: "var(--ct-alert-warning-border)",
          }}
        >
          <div
            className="ct-card-title"
            style={{ color: "var(--ct-alert-warning-text)" }}
          >
            {toolsError}
          </div>
          <div className="ct-card-body">
            <button
              type="button"
              className="ct-seg-btn"
              onClick={() => {
                setToolsError(null);
                setToolsLoading(true);
                setReloadKey((k) => k + 1);
              }}
            >
              Réessayer
            </button>
          </div>
        </div>
      ) : (
        <SwarmBuilder mode="create" availableTools={tools} />
      )}
    </>
  );
}
