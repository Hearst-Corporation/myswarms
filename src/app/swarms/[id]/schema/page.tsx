import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { isValidUuid } from "@/lib/utils/uuid";
import { formatDate } from "@/lib/utils/format";
import { parseInputSchema } from "@/lib/swarms/inputSchema";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { RecommendationBadge } from "@/components/swarms/RecommendationBadge";
import {
  PageTitle,
  Chevron,
  ErrorLayout,
  Card,
  CardBody,
  Badge,
  SectionLabel,
  EmptyState,
} from "@/components/ui";
import type {
  SwarmRecord,
  SwarmRun,
  SwarmRunSummary,
} from "@/lib/forms/swarmSchemas";

export const dynamic = "force-dynamic";

// ── Constantes d'affichage (pas de magic numbers inline) ────────────────────
const PIPELINE_MAX_WIDTH = 720; // px — largeur max de la colonne flux (lisible desktop, plein écran mobile)
const OBJECTIVE_CHARS = 240; // longueur max de l'objectif (task.description)
const OUTPUT_DECL_CHARS = 220; // longueur max de la sortie déclarée (task.expected_output)
const STEP_OUTPUT_CHARS = 200; // longueur max de l'aperçu d'un output de step
const REPORT_EXCERPT_CHARS = 320; // longueur max de l'extrait de rapport final

const BREADCRUMB =
  "inline-flex items-center text-xs font-semibold uppercase tracking-wider text-content-muted hover:text-content";
const PRIMARY_LINK =
  "inline-flex h-9 items-center rounded-[var(--radius-sm)] bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent-strong";
const SECONDARY_LINK =
  "inline-flex h-9 items-center rounded-[var(--radius-sm)] bg-surface-3 px-3 text-xs font-semibold text-content ring-1 ring-inset ring-line transition-colors hover:bg-elevated";
const CHIP =
  "inline-flex items-center whitespace-nowrap rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium uppercase tracking-tight text-content-muted";

type Agent = SwarmRecord["agents"][number];
type Task = SwarmRecord["tasks"][number];
type Step = SwarmRun["steps"][number];

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  if (!isValidUuid(id)) return { title: "Schéma — MySwarms" };
  try {
    const ownerId = await getOwnerId();
    const swarm = await swarmsClient.get(id, ownerId);
    return { title: `${swarm.name} · Schéma des agents — MySwarms` };
  } catch {
    return { title: "Schéma des agents — MySwarms" };
  }
}

export default async function SwarmSchemaPage({ params }: PageProps) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  // 1. Le swarm (topologie : agents + tasks + config) — requis.
  let swarm: SwarmRecord;
  try {
    const ownerId = await getOwnerId();
    swarm = await swarmsClient.get(id, ownerId);
  } catch (err) {
    if (err instanceof SwarmEngineError && err.status === 404) notFound();
    return (
      <div className="flex flex-col gap-6">
        <Link href={`/swarms/${id}`} className={BREADCRUMB}>
          <Chevron direction="left" />Swarm
        </Link>
        <ErrorLayout
          title="Schéma indisponible"
          message={err instanceof Error ? err.message : "Erreur inconnue"}
        />
      </div>
    );
  }

  // 2. Dernier run (résumé) — fail-soft, non bloquant.
  let lastRunSummary: SwarmRunSummary | null = null;
  try {
    const ownerId = await getOwnerId();
    const runs = await swarmsClient.listRuns(id, 10, ownerId);
    lastRunSummary =
      [...runs].sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      )[0] ?? null;
  } catch {
    // pas de runs lisibles — on affichera l'état vide
  }

  // 3. Détail du dernier run (steps + result_text) — fail-soft.
  let lastRun: SwarmRun | null = null;
  if (lastRunSummary) {
    try {
      const ownerId = await getOwnerId();
      lastRun = await swarmsClient.status(id, lastRunSummary.id, ownerId);
    } catch {
      lastRun = null;
    }
  }

  // ── Dérivations (données réelles uniquement) ──────────────────────────────
  const isTemplate = swarm.is_template === true;
  const inputFields = parseInputSchema(swarm.config_json as Record<string, unknown>);
  const agents = orderAgents(swarm.agents);
  const models = Array.from(
    new Set(swarm.agents.map((a) => a.model_name).filter(Boolean)),
  );
  const modelLabel =
    models.length === 0 ? "—" : models.map(prettyModel).join(" · ");

  const steps: Step[] = lastRun?.steps ?? [];
  const runHasSteps = steps.length > 0;
  const recommendation = extractRecommendation(lastRun?.result_text);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/swarms/${id}`} className={BREADCRUMB}>
        <Chevron direction="left" />Swarm
      </Link>

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <PageTitle>{swarm.name}</PageTitle>
            {isTemplate ? <Badge tone="neutral">TEMPLATE</Badge> : null}
          </div>
          <p
            className="mt-1 text-sm text-content-muted"
            style={{ maxWidth: PIPELINE_MAX_WIDTH }}
          >
            {swarm.description || "Aucune description."}
          </p>
          <div className="mt-2 flex flex-wrap gap-5 text-xs text-content-muted">
            <span>Provider : {modelLabel}</span>
            <span>
              {swarm.agents.length} agent{swarm.agents.length !== 1 ? "s" : ""}
            </span>
            <span>
              {swarm.tasks.length} task{swarm.tasks.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/swarms/${id}`} className={PRIMARY_LINK}>
            Lancer une recherche
          </Link>
          <Link href={`/swarms/${id}`} className={SECONDARY_LINK}>
            Voir les runs
          </Link>
          <Link href={`/swarms/${id}`} className={SECONDARY_LINK}>
            Retour au swarm
          </Link>
        </div>
      </div>

      {/* ── 4. Dernier run (aperçu) ──────────────────────────────────────── */}
      {lastRunSummary ? (
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitleInline>Dernier run</CardTitleInline>
              <Link
                href={`/swarms/${id}/runs/${lastRunSummary.id}`}
                className="inline-flex items-center text-sm text-accent hover:text-accent-strong"
              >
                Ouvrir le run <Chevron direction="right" />
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-5 text-sm text-content-muted">
              <Link
                href={`/swarms/${id}/runs/${lastRunSummary.id}`}
                className="font-mono text-sm text-accent hover:text-accent-strong"
              >
                {lastRunSummary.id.slice(0, 8)}…
              </Link>
              <StatusBadge status={lastRunSummary.status} />
              <span>
                début :{" "}
                {formatDate(lastRunSummary.started_at, { withSeconds: true })}
              </span>
              <span>
                fin :{" "}
                {lastRunSummary.finished_at
                  ? formatDate(lastRunSummary.finished_at, { withSeconds: true })
                  : "—"}
              </span>
              <span>
                {steps.length} step{steps.length !== 1 ? "s" : ""}
              </span>
              <span>
                {(
                  lastRunSummary.total_tokens_in +
                  lastRunSummary.total_tokens_out
                ).toLocaleString("en-US")}{" "}
                tok
              </span>
              {recommendation !== "UNKNOWN" ? (
                <RecommendationBadge rec={recommendation} />
              ) : null}
            </div>
            {lastRun && !runHasSteps ? (
              <p className="mt-3 text-xs leading-tight text-content-faint">
                {"Détail par agent indisponible : les steps de ce run n'ont pas été journalisés. Le schéma ci-dessous montre le plan d'exécution du swarm."}
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <EmptyState
              title="Aucun run"
              description="Lance une recherche pour voir les agents opérer en temps réel."
            />
          </CardBody>
        </Card>
      )}

      {/* ── 2 + 3. Agent graph + handoff (flux vertical) ─────────────────── */}
      <div className="mx-auto w-full" style={{ maxWidth: PIPELINE_MAX_WIDTH }}>
        {/* Input utilisateur */}
        <EndpointNode label="Input utilisateur" tone="neutral">
          {inputFields.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {inputFields.map((f) => (
                <span key={f.key} className={CHIP}>
                  {f.label}
                  {f.required ? " *" : ""}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-sm text-content-muted">
              {"Déclenchement manuel (pas d'inputs structurés)."}
            </span>
          )}
        </EndpointNode>

        {agents.length === 0 ? (
          <>
            <FlowConnector />
            <Card>
              <CardBody>
                <p className="text-sm text-content-faint">
                  {"Ce swarm n'a aucun agent défini."}
                </p>
              </CardBody>
            </Card>
          </>
        ) : (
          agents.map((agent, idx) => {
            const task = taskForAgent(swarm.tasks, agent);
            const inputs = inputsForAgent(agent, task, swarm.agents, swarm.tasks, inputFields);
            const agentSteps = stepsForAgent(steps, agent);
            const lastStep = agentSteps[agentSteps.length - 1] ?? null;
            return (
              <div key={agent.id ?? agent.name}>
                <FlowConnector label={idx === 0 ? undefined : HANDOFF_LABEL} />
                <AgentCard
                  order={idx + 1}
                  agent={agent}
                  task={task}
                  inputs={inputs}
                  lastStep={lastStep}
                />
              </div>
            );
          })
        )}

        {/* Rapport final */}
        <FlowConnector label={agents.length > 0 ? HANDOFF_REPORT_LABEL : undefined} />
        <EndpointNode label="Rapport final" tone="accent">
          {lastRun?.status === "completed" && lastRun.result_text ? (
            <div>
              {recommendation !== "UNKNOWN" ? (
                <div className="mb-2">
                  <RecommendationBadge rec={recommendation} size="md" />
                </div>
              ) : null}
              <p className="text-sm leading-relaxed text-content">
                {plainExcerpt(lastRun.result_text, REPORT_EXCERPT_CHARS)}
              </p>
              <Link
                href={`/swarms/${id}/runs/${lastRunSummary?.id ?? ""}`}
                className="mt-3 inline-flex items-center text-sm text-accent hover:text-accent-strong"
              >
                Ouvrir le rapport complet <Chevron direction="right" />
              </Link>
            </div>
          ) : (
            <span className="text-sm text-content-muted">
              {lastRun
                ? "Run non terminé — le rapport final apparaîtra ici une fois le run complété."
                : "Lance une recherche pour générer le rapport final."}
            </span>
          )}
        </EndpointNode>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Sous-composants (server components, pas d'état)
// ════════════════════════════════════════════════════════════════════════════

function CardTitleInline({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-content-strong">{children}</h3>
  );
}

function AgentCard({
  order,
  agent,
  task,
  inputs,
  lastStep,
}: {
  order: number;
  agent: Agent;
  task: Task | null;
  inputs: string[];
  lastStep: Step | null;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-mono text-xs text-content-faint">
              #{order}
            </span>
            <span className="font-semibold text-content-strong">
              {agent.name}
            </span>
            <span className={CHIP}>{agent.role}</span>
          </div>
          {lastStep ? <StatusBadge status={lastStep.status} /> : null}
        </div>

        <div className="mt-1 text-xs text-content-muted">
          {prettyModel(agent.model_name)} · {agent.model_provider}
        </div>

        {task ? (
          <MetaRow label="Task">
            <span className="font-medium">{task.name}</span>
          </MetaRow>
        ) : null}

        {task?.description ? (
          <MetaRow label="Objectif">{truncate(task.description, OBJECTIVE_CHARS)}</MetaRow>
        ) : null}

        <MetaRow label="Inputs attendus">
          {inputs.length > 0 ? inputs.join(", ") : "—"}
        </MetaRow>

        {task?.expected_output ? (
          <MetaRow label="Outputs produits">
            {truncate(task.expected_output, OUTPUT_DECL_CHARS)}
          </MetaRow>
        ) : null}

        {lastStep?.output_text ? (
          <div className="mt-3 border-t border-line pt-3">
            <SectionLabel text="Dernier output" />
            <p className="text-sm leading-tight text-content">
              {plainExcerpt(lastStep.output_text, STEP_OUTPUT_CHARS)}
            </p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function EndpointNode({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "neutral" | "accent";
  children: ReactNode;
}) {
  return (
    <Card className={tone === "accent" ? "bg-accent/10 ring-accent/30" : undefined}>
      <CardBody>
        <h3 className="mb-2 text-sm font-semibold text-content-strong">
          {label}
        </h3>
        {children}
      </CardBody>
    </Card>
  );
}

function FlowConnector({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-2">
      <span className="text-lg leading-none text-content-faint">↓</span>
      {label ? (
        <span className="mt-1 max-w-[360px] text-center text-xs italic leading-tight text-content-faint">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2">
      <SectionLabel text={label} />
      <div className="text-sm leading-tight text-content">{children}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Helpers purs (données réelles uniquement, aucune invention)
// ════════════════════════════════════════════════════════════════════════════

// Handoff jamais sérialisé en DB (cf. moteur CrewAI : Task(context=[dep]) en
// mémoire uniquement) → libellé honnête, identique pour chaque transition.
const HANDOFF_LABEL = "Transmission via contexte de task / output précédent";
const HANDOFF_REPORT_LABEL = "Génère le rapport final";

/** Ordre d'exécution = ordre de design (position_y puis position_x, puis nom). */
function orderAgents(agents: Agent[]): Agent[] {
  return [...agents].sort(
    (a, b) =>
      a.position_y - b.position_y ||
      a.position_x - b.position_x ||
      a.name.localeCompare(b.name),
  );
}

/** Première task portée par cet agent (matching par id réel). */
function taskForAgent(tasks: Task[], agent: Agent): Task | null {
  if (!agent.id) return null;
  return tasks.find((t) => t.agent_id === agent.id) ?? null;
}

/**
 * Inputs attendus par un agent :
 *  - racine (task sans dépendance, ou pas de task) → champs d'input utilisateur ;
 *  - sinon → "Sortie de <agent de la task dont on dépend>" (réel, via depends_on_task_id).
 */
function inputsForAgent(
  agent: Agent,
  task: Task | null,
  agents: Agent[],
  tasks: Task[],
  inputFields: { label: string }[],
): string[] {
  if (task?.depends_on_task_id) {
    const depTask = tasks.find((t) => t.id === task.depends_on_task_id) ?? null;
    const depAgent = depTask
      ? agents.find((a) => a.id === depTask.agent_id) ?? null
      : null;
    if (depAgent) return [`Sortie de ${depAgent.name}`];
    if (depTask) return [`Sortie de la task « ${depTask.name} »`];
  }
  return inputFields.map((f) => f.label);
}

/** Steps du dernier run rattachés à cet agent (par agent_id réel, fallback nom). */
function stepsForAgent(steps: Step[], agent: Agent): Step[] {
  return steps.filter((s) =>
    agent.id && s.agent_id ? s.agent_id === agent.id : s.agent_name === agent.name,
  );
}

/** "gpt-4o" → "Gpt 4o". Title-case par segment, sans table de mapping. */
function prettyModel(model: string): string {
  if (!model) return "—";
  return model
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

/** Texte brut lisible depuis du Markdown : retire titres/gras/puces, condense les espaces. */
function plainExcerpt(md: string, max: number): string {
  const plain = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(plain, max);
}
