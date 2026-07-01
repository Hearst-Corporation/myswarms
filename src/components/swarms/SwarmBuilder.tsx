"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  SwarmInputSchema,
  type SwarmInput,
  type SwarmInputRaw,
  type AgentInput,
  type TaskInput,
  type Tool,
  type ToolBindingInput,
  type SwarmSpecResponse,
} from "@/lib/forms/swarmSchemas";
import { BuilderAgentsTab } from "./BuilderAgentsTab";
import { BuilderTasksTab } from "./BuilderTasksTab";
import { BuilderToolsTab } from "./BuilderToolsTab";
import { ArchitectModal } from "./ArchitectModal";
import { isValidUuid } from "@/lib/utils/uuid";
import { type BuilderTabId, parseBuilderTab } from "@/lib/swarms/builderTabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Field,
  Input,
  Textarea,
  Button,
  Alert,
} from "@/components/ui";
import { SparklesIcon } from "@heroicons/react/24/outline";

type BuilderMode = "create" | "edit";

interface SwarmBuilderProps {
  mode: BuilderMode;
  swarmId?: string;
  initialSwarm?: SwarmInputRaw;
  availableTools?: Tool[];
}

const EMPTY_SWARM: SwarmInputRaw = {
  name: "",
  description: "",
  version: 1,
  config_json: {},
  is_active: true,
  is_template: false,
  agents: [],
  tasks: [],
  tool_bindings: [],
};

// G10 fix : `crypto.randomUUID()` direct (dispo Node 19+ et tous les
// navigateurs modernes). Pas de fallback artisanal — si crypto.randomUUID
// manque, c'est un environnement non supporté.
function generateLocalId(): string {
  return crypto.randomUUID();
}

export function SwarmBuilder({
  mode,
  swarmId,
  initialSwarm,
  availableTools = [],
}: SwarmBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab: BuilderTabId = parseBuilderTab(searchParams.get("tab"));
  const [agents, setAgents] = useState<AgentInput[]>(
    (initialSwarm?.agents ?? []) as AgentInput[],
  );
  const [tasks, setTasks] = useState<TaskInput[]>(
    (initialSwarm?.tasks ?? []) as TaskInput[],
  );
  const [toolBindings, setToolBindings] = useState<ToolBindingInput[]>(
    (initialSwarm?.tool_bindings ?? []) as ToolBindingInput[],
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [architectOpen, setArchitectOpen] = useState(false);
  // Incrémenté à chaque ouverture → remonte le modal avec un state propre
  // (évite un reset via setState-in-effect, flaggé par le lint).
  const [architectKey, setArchitectKey] = useState(0);

  // Pattern Zod 4 + react-hook-form : `<TInput, TContext, TOutput>` —
  // l'input contient les défauts optionnels, l'output est résolu (avec défauts appliqués).
  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
    setValue,
  } = useForm<SwarmInputRaw, undefined, SwarmInput>({
    resolver: zodResolver(SwarmInputSchema),
    defaultValues: initialSwarm ?? EMPTY_SWARM,
  });

  const onSubmit = async (data: SwarmInput) => {
    setSubmitting(true);
    setSubmitError(null);

    // C5 : validation côté client avant d'envoyer un swarm structurellement vide.
    if (agents.length === 0) {
      setSubmitError("At least 1 agent required to create a swarm.");
      setSubmitting(false);
      return;
    }
    if (tasks.length === 0) {
      setSubmitError("At least 1 task required to create a swarm.");
      setSubmitting(false);
      return;
    }

    const payload: SwarmInput = {
      ...data,
      agents,
      tasks,
      tool_bindings: toolBindings,
    };

    try {
      const url = mode === "create" ? "/api/swarms" : `/api/swarms/${swarmId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`${res.status} — ${body}`);
      }
      const saved = (await res.json()) as { id: string };
      router.push(`/swarms/${saved.id}`);
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Agent mutations (passées à BuilderAgentsTab) ────────────────────────
  const addAgent = (agent: AgentInput) => {
    const withId: AgentInput = { ...agent, id: agent.id ?? generateLocalId() };
    setAgents((prev) => [...prev, withId]);
  };
  const updateAgent = (idx: number, agent: AgentInput) =>
    setAgents((prev) => prev.map((a, i) => (i === idx ? agent : a)));
  const removeAgent = (idx: number) =>
    setAgents((prev) => prev.filter((_, i) => i !== idx));

  // ── Task mutations ──────────────────────────────────────────────────────
  const addTask = (task: TaskInput) => {
    const withId: TaskInput = { ...task, id: task.id ?? generateLocalId() };
    setTasks((prev) => [...prev, withId]);
  };
  const updateTask = (idx: number, task: TaskInput) =>
    setTasks((prev) => prev.map((t, i) => (i === idx ? task : t)));
  const removeTask = (idx: number) =>
    setTasks((prev) => prev.filter((_, i) => i !== idx));

  // ── Architect Agent : injection de la spec générée ──────────────────────
  //
  // Choix : bouton disponible en mode `create` ET `edit`. En `edit`, on
  // confirme avant d'écraser le contenu existant (action destructive). Aucune
  // création auto : la spec hydrate le state, l'utilisateur revoit/édite puis
  // clique "Save" (flux existant inchangé).
  //
  // Cohérence des ids : on conserve les UUID valides fournis par l'architecte
  // (et leurs références croisées), on (re)génère un id local UNIQUEMENT pour
  // les entités sans UUID valide, en remappant les références correspondantes.
  const onGenerated = (spec: SwarmSpecResponse) => {
    if (mode === "edit") {
      const ok = window.confirm(
        "Replace the current builder content with the generated spec? Unsaved changes will be lost.",
      );
      if (!ok) return;
    }

    const specAgents = spec.agents ?? [];
    const specTasks = spec.tasks ?? [];
    const specBindings = spec.tool_bindings ?? [];

    // Map ancien id → nouvel id (régénéré si id absent / non-UUID).
    const agentIdMap = new Map<string, string>();
    const nextAgents: AgentInput[] = specAgents.map((a) => {
      const oldId = a.id;
      const newId =
        oldId && isValidUuid(oldId) ? oldId : generateLocalId();
      if (oldId) agentIdMap.set(oldId, newId);
      return { ...a, id: newId } as AgentInput;
    });
    // Second passage : remap parent_agent_id sur les nouveaux ids.
    const resolvedAgents = nextAgents.map((a) => ({
      ...a,
      parent_agent_id:
        a.parent_agent_id && agentIdMap.has(a.parent_agent_id)
          ? agentIdMap.get(a.parent_agent_id)!
          : a.parent_agent_id ?? null,
    }));

    const taskIdMap = new Map<string, string>();
    const nextTasks: TaskInput[] = specTasks.map((t) => {
      const oldId = t.id;
      const newId =
        oldId && isValidUuid(oldId) ? oldId : generateLocalId();
      if (oldId) taskIdMap.set(oldId, newId);
      return { ...t, id: newId } as TaskInput;
    });
    const resolvedTasks = nextTasks.map((t) => ({
      ...t,
      agent_id:
        t.agent_id && agentIdMap.has(t.agent_id)
          ? agentIdMap.get(t.agent_id)!
          : t.agent_id,
      depends_on_task_id:
        t.depends_on_task_id && taskIdMap.has(t.depends_on_task_id)
          ? taskIdMap.get(t.depends_on_task_id)!
          : t.depends_on_task_id ?? null,
    }));

    const resolvedBindings: ToolBindingInput[] = specBindings.map((b) => ({
      ...b,
      id: b.id && isValidUuid(b.id) ? b.id : generateLocalId(),
      agent_id:
        b.agent_id && agentIdMap.has(b.agent_id)
          ? agentIdMap.get(b.agent_id)!
          : b.agent_id,
    }));

    setAgents(resolvedAgents);
    setTasks(resolvedTasks);
    setToolBindings(resolvedBindings);
    setValue("name", spec.name ?? "", { shouldDirty: true });
    setValue("description", spec.description ?? "", { shouldDirty: true });
    setValue("is_active", spec.is_active ?? true, { shouldDirty: true });
    setValue("is_template", spec.is_template ?? false, { shouldDirty: true });
    setSubmitError(null);
  };

  const previewJson = useMemo(() => {
    const snapshot = {
      ...getValues(),
      agents,
      tasks,
      tool_bindings: toolBindings,
    };
    return JSON.stringify(snapshot, null, 2);
  }, [agents, tasks, toolBindings, getValues]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          variant="primary"
          onClick={() => {
            setArchitectKey((k) => k + 1);
            setArchitectOpen(true);
          }}
          disabled={submitting}
        >
          <SparklesIcon className="size-4" />
          Generate with AI
        </Button>
      </div>

      <ArchitectModal
        key={architectKey}
        open={architectOpen}
        onClose={() => setArchitectOpen(false)}
        onGenerated={onGenerated}
      />

      {activeTab === "overview" && (
        <Card
          role="tabpanel"
          id="swarm-panel-overview"
          aria-labelledby="swarm-tab-overview"
          tabIndex={0}
        >
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-5">
            <Field
              label="Swarm name"
              error={errors.name?.message}
            >
              <Input {...register("name")} placeholder="e.g. Daily Inbox Triage" />
            </Field>

            <Field label="Description">
              <Textarea
                {...register("description")}
                rows={4}
                placeholder="What is this swarm for?"
              />
            </Field>

            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2 text-sm text-content">
                <input
                  type="checkbox"
                  className="accent-[var(--color-accent)]"
                  {...register("is_active")}
                />
                Active (triggerable)
              </label>
              <label className="flex items-center gap-2 text-sm text-content">
                <input
                  type="checkbox"
                  className="accent-[var(--color-accent)]"
                  {...register("is_template")}
                />
                Template
              </label>
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === "agents" && (
        <div
          role="tabpanel"
          id="swarm-panel-agents"
          aria-labelledby="swarm-tab-agents"
          tabIndex={0}
        >
          <BuilderAgentsTab
            agents={agents}
            onAdd={addAgent}
            onUpdate={updateAgent}
            onRemove={removeAgent}
          />
        </div>
      )}

      {activeTab === "tasks" && (
        <div
          role="tabpanel"
          id="swarm-panel-tasks"
          aria-labelledby="swarm-tab-tasks"
          tabIndex={0}
        >
          <BuilderTasksTab
            agents={agents}
            tasks={tasks}
            onAdd={addTask}
            onUpdate={updateTask}
            onRemove={removeTask}
          />
        </div>
      )}

      {activeTab === "tools" && (
        <div
          role="tabpanel"
          id="swarm-panel-tools"
          aria-labelledby="swarm-tab-tools"
          tabIndex={0}
        >
          <BuilderToolsTab
            availableTools={availableTools}
            toolBindings={toolBindings}
            agents={agents}
            onChange={setToolBindings}
          />
        </div>
      )}

      {activeTab === "preview" && (
        <Card
          role="tabpanel"
          id="swarm-panel-preview"
          aria-labelledby="swarm-tab-preview"
          tabIndex={0}
        >
          <CardHeader>
            <CardTitle>JSON Preview</CardTitle>
          </CardHeader>
          <CardBody>
            <pre className="max-h-[480px] overflow-auto rounded-[var(--radius-md)] bg-surface-2 p-3 font-mono text-sm text-content ring-1 ring-inset ring-line">
              {previewJson}
            </pre>
          </CardBody>
        </Card>
      )}

      {submitError ? (
        <Alert tone="error" role="alert" title="Error">
          {submitError}
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => router.push("/swarms")}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting
            ? "Saving…"
            : mode === "create"
              ? "Create swarm"
              : "Save"}
        </Button>
      </div>
    </form>
  );
}
