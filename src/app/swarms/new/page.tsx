"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SwarmBuilder } from "@/components/swarms/SwarmBuilder";
import type { Tool } from "@/lib/forms/swarmSchemas";
import { Chevron } from "@/components/ui/Chevron";
import { PageHeader, Card, CardBody, Alert, Button, Skeleton } from "@/components/ui";

export default function NewSwarmPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tools", { signal: AbortSignal.timeout(15000) })
      .then((r) => {
        if (!r.ok) throw new Error(`Catalog unavailable (HTTP ${r.status})`);
        return r.json();
      })
      .then((data: Tool[]) => {
        if (!cancelled) setTools(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg =
          err instanceof Error && err.name === "TimeoutError"
            ? "Timeout — CrewAI engine unreachable."
            : "Could not load tools.";
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
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/swarms"
          className="inline-flex items-center text-xs font-semibold uppercase tracking-wider text-content-muted hover:text-content"
        >
          <Chevron direction="left" />
          Swarms
        </Link>
      </div>

      <PageHeader
        title="New swarm"
        subtitle="Define name, agents, tasks and tools. You can edit after creation."
      />

      {toolsLoading ? (
        <Card aria-busy="true" aria-live="polite">
          <CardBody className="flex flex-col gap-3">
            <p className="text-sm font-semibold text-content-strong">
              Loading tools…
            </p>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardBody>
        </Card>
      ) : toolsError ? (
        <Alert tone="warning" role="alert" title={toolsError}>
          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setToolsError(null);
                setToolsLoading(true);
                setReloadKey((k) => k + 1);
              }}
            >
              Retry
            </Button>
          </div>
        </Alert>
      ) : (
        <SwarmBuilder mode="create" availableTools={tools} />
      )}
    </div>
  );
}
