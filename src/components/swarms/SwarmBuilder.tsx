"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "@/lib/forms/swarmSchemas";
import { BuilderAgentsTab } from "./BuilderAgentsTab";
import { BuilderTasksTab } from "./BuilderTasksTab";
import { BuilderToolsTab } from "./BuilderToolsTab";
import { ArchitectModal } from "./ArchitectModal";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { isValidUuid } from "@/lib/utils/uuid";
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SIZE, SPACING } from "@/lib/ui/tokens";

type BuilderMode = "create" | "edit";
type Tab = "overview" | "agents" | "tasks" | "tools" | "preview";

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

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Agents" },
  { id: "tasks", label: "Tasks" },
  { id: "tools", label: "Tools" },
  { id: "preview", label: "Preview" },
];

// G10 fix : `crypto.randomUUID()` direct (dispo Node 19+ et tous les
// navigateurs modernes). Pas de fallback artisanal — si crypto.randomUUID
// manque, c'est un environnement non supporté.
function generateLocalId(): string {
  return crypto.randomUUID();
}

// Dirty detection robuste : sérialise les clés des objets dans un ordre stable
// pour éviter les faux positifs dus à l'ordre d'insertion après spread.
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (v as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return v;
  });
}

export function SwarmBuilder({
  mode,
  swarmId,
  initialSwarm,
  availableTools = [],
}: SwarmBuilderProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
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
  // AlertDialog : remplacement spec IA en mode edit
  const [pendingSpec, setPendingSpec] = useState<SwarmInput | null>(null);
  // AlertDialog : abandon modifications (dirty)
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // IDs accessibilité checkboxes
  const isActiveId = useId();
  const isTemplateId = useId();

  // Pattern Zod 4 + react-hook-form : `<TInput, TContext, TOutput>` —
  // l'input contient les défauts optionnels, l'output est résolu (avec défauts appliqués).
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty: formIsDirty },
    getValues,
    setValue,
  } = useForm<SwarmInputRaw, undefined, SwarmInput>({
    resolver: zodResolver(SwarmInputSchema),
    defaultValues: initialSwarm ?? EMPTY_SWARM,
  });

  // Dirty detection pour les listes gérées en useState (hors react-hook-form)
  const agentsChanged =
    stableStringify(agents) !== stableStringify((initialSwarm?.agents ?? []) as AgentInput[]);
  const tasksChanged =
    stableStringify(tasks) !== stableStringify((initialSwarm?.tasks ?? []) as TaskInput[]);
  const bindingsChanged =
    stableStringify(toolBindings) !== stableStringify((initialSwarm?.tool_bindings ?? []) as ToolBindingInput[]);
  const isDirty = formIsDirty || agentsChanged || tasksChanged || bindingsChanged;

  const onSubmit = async (data: SwarmInput) => {
    setSubmitting(true);
    setSubmitError(null);

    // C5 : validation côté client avant d'envoyer un swarm structurellement vide.
    if (agents.length === 0) {
      setSubmitError("Au moins 1 agent requis pour créer un swarm.");
      setSubmitting(false);
      return;
    }
    if (tasks.length === 0) {
      setSubmitError("Au moins 1 tâche requise pour créer un swarm.");
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
      setSubmitError(err instanceof Error ? err.message : "Erreur inconnue");
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
  const applySpec = (spec: SwarmInput) => {
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
    // Si la ref est orpheline (absent du map), null plutôt que conserver un id invalide.
    const resolvedAgents = nextAgents.map((a) => ({
      ...a,
      parent_agent_id:
        a.parent_agent_id && agentIdMap.has(a.parent_agent_id)
          ? agentIdMap.get(a.parent_agent_id)!
          : null,
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
      // Si ref orpheline : string vide → déclenche le placeholder "Aucun agent — re-pair requis"
      agent_id:
        t.agent_id && agentIdMap.has(t.agent_id)
          ? agentIdMap.get(t.agent_id)!
          : "",
      // Si ref orpheline : null plutôt que conserver un id invalide
      depends_on_task_id:
        t.depends_on_task_id && taskIdMap.has(t.depends_on_task_id)
          ? taskIdMap.get(t.depends_on_task_id)!
          : null,
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
    setActiveTab("overview");
  };

  // onGenerated : en mode edit, ouvre la confirmation avant d'écraser.
  // En mode create, applique directement.
  const onGenerated = (spec: SwarmInput) => {
    if (mode === "edit") {
      setPendingSpec(spec);
    } else {
      applySpec(spec);
    }
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
    <>
      {/* AlertDialog : confirmation remplacement spec IA en mode edit */}
      <AlertDialog
        open={pendingSpec !== null}
        onClose={() => setPendingSpec(null)}
        onConfirm={() => {
          if (pendingSpec) applySpec(pendingSpec);
          setPendingSpec(null);
        }}
        title="Remplacer le contenu du builder ?"
        description="La spec générée va écraser les agents, tâches et tools actuels. Tu pourras toujours éditer après."
        variant="warning"
        impact={<>{agents.length} agent(s) et {tasks.length} tâche(s) seront remplacés.</>}
        confirmLabel="Remplacer"
        cancelLabel="Annuler"
      />

      {/* AlertDialog : abandon modifications dirty */}
      <AlertDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={() => { setShowCancelDialog(false); router.push("/swarms"); }}
        title="Abandonner les modifications ?"
        description="Tu as des changements non sauvegardés. Cette action est irréversible."
        variant="warning"
        confirmLabel="Abandonner"
        cancelLabel="Rester"
      />

    <form onSubmit={handleSubmit(onSubmit)}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: SPACING.md,
          flexWrap: "wrap",
          marginBottom: SPACING.xl,
        }}
      >
        <div className="ct-seg-track" style={{ display: "inline-flex" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`ct-seg-btn ${activeTab === t.id ? "active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ct-seg-btn primary"
          onClick={() => {
            setArchitectKey((k) => k + 1);
            setArchitectOpen(true);
          }}
          disabled={submitting}
          aria-disabled={submitting}
        >
          ✨ Générer avec l&apos;IA
        </button>
      </div>

      <ArchitectModal
        key={architectKey}
        open={architectOpen}
        onClose={() => setArchitectOpen(false)}
        onGenerated={onGenerated}
      />

      {activeTab === "overview" && (
        <div className="ct-card">
          <div className="ct-card-title">Identité</div>
          <div style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}>
            <label style={labelStyle}>
              <span style={labelText}>Nom du swarm</span>
              <input
                {...register("name")}
                style={inputStyle}
                placeholder="ex: Daily Inbox Triage"
              />
              {errors.name ? (
                <span style={errorStyle}>{errors.name.message}</span>
              ) : null}
            </label>

            <label style={labelStyle}>
              <span style={labelText}>Description</span>
              <textarea
                {...register("description")}
                rows={4}
                style={{ ...inputStyle, resize: "vertical" }}
                placeholder="Pour quoi est conçu ce swarm ?"
              />
            </label>

            <div style={{ display: "flex", gap: SPACING.lg, flexWrap: "wrap" }}>
              <label
                htmlFor={isActiveId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: SPACING.sm,
                  fontSize: FONT.base,
                  color: "var(--ct-text-primary)",
                }}
              >
                <input id={isActiveId} type="checkbox" {...register("is_active")} />
                Actif (déclenchable)
              </label>
              <label
                htmlFor={isTemplateId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: SPACING.sm,
                  fontSize: FONT.base,
                  color: "var(--ct-text-primary)",
                }}
              >
                <input id={isTemplateId} type="checkbox" {...register("is_template")} />
                Template
              </label>
            </div>
          </div>
        </div>
      )}

      {activeTab === "agents" && (
        <BuilderAgentsTab
          agents={agents}
          tasks={tasks}
          onAdd={addAgent}
          onUpdate={updateAgent}
          onRemove={removeAgent}
        />
      )}

      {activeTab === "tasks" && (
        <BuilderTasksTab
          agents={agents}
          tasks={tasks}
          onAdd={addTask}
          onUpdate={updateTask}
          onRemove={removeTask}
        />
      )}

      {activeTab === "tools" && (
        <BuilderToolsTab
          availableTools={availableTools}
          toolBindings={toolBindings}
          agents={agents}
          onChange={setToolBindings}
        />
      )}

      {activeTab === "preview" && (
        <div className="ct-card">
          <div className="ct-card-title">JSON Preview</div>
          <pre
            style={{
              background: "var(--ct-surface-2)",
              border: "1px solid var(--ct-border)",
              borderRadius: RADIUS.md,
              padding: SPACING.md,
              fontSize: FONT.sm,
              color: "var(--ct-text-primary)",
              fontFamily: "var(--font-mono)",
              overflow: "auto",
              maxHeight: SIZE.previewMaxH,
            }}
          >
            {previewJson}
          </pre>
        </div>
      )}

      {submitError ? (
        <div
          className="ct-card"
          style={{
            borderColor: "var(--ct-border-accent)",
            background: "var(--ct-accent-soft)",
          }}
        >
          <div className="ct-card-title">Erreur</div>
          <p className="ct-card-body">{submitError}</p>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: SPACING.sm,
          justifyContent: "flex-end",
          marginTop: SPACING.xl,
        }}
      >
        <button
          type="button"
          className="ct-seg-btn"
          onClick={() => {
            if (isDirty) {
              setShowCancelDialog(true);
            } else {
              router.push("/swarms");
            }
          }}
          disabled={submitting}
          aria-disabled={submitting}
        >
          Annuler
        </button>
        <button
          type="submit"
          className="ct-seg-btn primary"
          disabled={submitting}
          aria-disabled={submitting}
        >
          {submitting
            ? "Sauvegarde…"
            : mode === "create"
              ? "Créer le swarm"
              : "Enregistrer"}
        </button>
      </div>
    </form>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACING.xxs,
};
const labelText: React.CSSProperties = {
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.semibold,
  letterSpacing: LETTER_SPACING.tight,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};
const inputStyle: React.CSSProperties = {
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.s}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontFamily: "inherit",
};
const errorStyle: React.CSSProperties = {
  fontSize: FONT.xs,
  color: "var(--ct-accent-strong)",
};
