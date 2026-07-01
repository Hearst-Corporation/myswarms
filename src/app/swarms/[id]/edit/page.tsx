"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { SwarmBuilder } from "@/components/swarms/SwarmBuilder";
import type { SwarmRecord, Tool } from "@/lib/forms/swarmSchemas";
import {
  Chevron,
  PageTitle,
  ErrorLayout,
  Card,
  CardBody,
  Skeleton,
} from "@/components/ui";

interface PageProps {
  params: Promise<{ id: string }>;
}

const BREADCRUMB =
  "inline-flex items-center text-xs font-semibold uppercase tracking-wider text-content-muted hover:text-content";

export default function EditSwarmPage({ params }: PageProps) {
  const { id } = use(params);
  const [swarm, setSwarm] = useState<SwarmRecord | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [swarmRes, toolsRes] = await Promise.all([
          fetch(`/api/swarms/${id}`),
          fetch("/api/tools").catch(() => null),
        ]);
        if (!swarmRes.ok) {
          throw new Error(`Failed to load swarm: ${swarmRes.status}`);
        }
        const swarmData = (await swarmRes.json()) as SwarmRecord;
        if (cancelled) return;
        setSwarm(swarmData);

        if (toolsRes?.ok) {
          const toolsData = (await toolsRes.json()) as Tool[];
          if (!cancelled) setTools(Array.isArray(toolsData) ? toolsData : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Card>
        <CardBody className="flex flex-col gap-3">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-24 w-full" />
        </CardBody>
      </Card>
    );
  }

  if (error || !swarm) {
    return (
      <div className="flex flex-col gap-6">
        <Link href="/swarms" className={BREADCRUMB}>
          <Chevron direction="left" />Swarms
        </Link>
        <ErrorLayout title="Edit failed" message={error ?? "Swarm not found."} />
      </div>
    );
  }

  // Conversion SwarmRecord → SwarmInput.
  // `tasks` et `tool_bindings` peuvent avoir `agent_id=null` après une cascade
  // SET NULL en DB (task/binding orpheline). Le builder attend `agent_id: string`.
  // On normalise null → "" : SwarmTaskForm affiche "Aucun agent — re-pair requis"
  // et la validation Zod bloque le save tant que le re-pair n'est pas effectué.
  const initialSwarm = {
    id: swarm.id,
    name: swarm.name,
    description: swarm.description ?? "",
    version: swarm.version,
    config_json: swarm.config_json,
    is_active: swarm.is_active,
    is_template: swarm.is_template,
    agents: swarm.agents,
    tasks: swarm.tasks.map((t) => ({
      ...t,
      agent_id: t.agent_id ?? "",
    })),
    tool_bindings: swarm.tool_bindings.map((b) => ({
      ...b,
      agent_id: b.agent_id ?? "",
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/swarms/${id}`} className={BREADCRUMB}>
        <Chevron direction="left" />
        {swarm.name}
      </Link>
      <div className="border-b border-line pb-5">
        <PageTitle>Edit swarm</PageTitle>
        <p className="mt-1 text-sm text-content-muted">
          Edit name, agents, tasks and linked tools.
        </p>
      </div>

      <SwarmBuilder
        mode="edit"
        swarmId={id}
        initialSwarm={initialSwarm}
        availableTools={tools}
      />
    </div>
  );
}
