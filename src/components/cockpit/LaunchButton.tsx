"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/ui/cn";

type EngineStatus = "up" | "down" | "starting" | "unknown";

const ENGINE_POLL_INTERVAL_MS = 5000;
const ENGINE_START_POLL_DELAY_MS = 1000;
const ENGINE_START_MAX_ATTEMPTS = 20;

export function LaunchButton() {
  const [status, setStatus] = useState<EngineStatus>("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/system/status");
      const data = await res.json();
      if (data.engine === "ok") {
        setStatus("up");
        setError(null); // clear error sur recovery automatique
      } else {
        setStatus("down");
      }
    } catch {
      setStatus("unknown");
    }
  }, []);

  useEffect(() => {
    if (status === "up") return;
    // setTimeout 0 évite l'appel synchrone setState-in-effect
    const t = setTimeout(checkStatus, 0);
    const interval = setInterval(checkStatus, ENGINE_POLL_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.hidden) clearInterval(interval);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [checkStatus, status]);

  const handleLaunch = async () => {
    if (status === "up" || loading) return;
    setLoading(true);
    setError(null);
    setStatus("starting");
    try {
      const startRes = await fetch("/api/system/start", { method: "POST" });
      if (!startRes.ok) {
        throw new Error("Cannot start — engine unreachable");
      }
      let started = false;
      for (let i = 0; i < ENGINE_START_MAX_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, ENGINE_START_POLL_DELAY_MS));
        const res = await fetch("/api/system/status");
        const data = await res.json();
        if (data.engine === "ok") {
          setStatus("up");
          started = true;
          break;
        }
      }
      if (!started) {
        setError(`Engine did not start after ${ENGINE_START_MAX_ATTEMPTS}s — check logs`);
        setStatus("down");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot start — engine unreachable");
      setStatus("down");
    } finally {
      setLoading(false);
      checkStatus();
    }
  };

  const dotColor =
    status === "up"
      ? "var(--color-ok)"
      : status === "starting"
        ? "var(--color-warn)"
        : status === "down"
          ? "var(--color-danger)"
          : "var(--color-content-faint)";

  const label =
    status === "up"
      ? "Engine"
      : status === "starting"
        ? "Starting…"
        : status === "down"
          ? "Launch"
          : "Engine";

  const isDisabled = status === "up" || status === "starting";
  const titleText = error
    ? error
    : status === "up"
      ? "Engine running"
      : "Click to start the engine";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleLaunch}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-[var(--radius-md)] px-3 text-xs font-semibold",
          "ring-1 ring-inset ring-line transition-colors",
          isDisabled ? "cursor-default bg-surface-2" : "cursor-pointer bg-surface-3 hover:bg-elevated",
        )}
        title={titleText}
        aria-label={`CrewAI engine — ${label}${status === "down" ? ". Click to start." : ""}`}
      >
        <span
          className="size-2 rounded-full"
          style={{ background: dotColor }}
          aria-hidden="true"
        />
        <span aria-live="polite" className="text-content-muted">
          {label}
        </span>
      </button>
      {error && (
        <span role="alert" aria-live="polite" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
