import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { isValidUuid } from "@/lib/utils/uuid";
import { formatDate } from "@/lib/utils/format";
import { parseInputSchema } from "@/lib/swarms/inputSchema";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { RecommendationBadge } from "@/components/swarms/RecommendationBadge";
import { PageTitle } from "@/components/ui/PageTitle";
import { Chevron } from "@/components/ui/Chevron";
import { ErrorLayout } from "@/components/ui/ErrorLayout";
import {
  FONT,
  FONT_WEIGHT,
  LETTER_SPACING,
  LINE_HEIGHT,
  RADIUS,
  SPACING,
} from "@/lib/ui/tokens";
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
      <>
        <div className="ct-eyebrow">
          <Link href={`/swarms/${id}`} className="ct-breadcrumb-link">
            <Chevron direction="left" />Swarm
          </Link>
        </div>
        <ErrorLayout
          title="Schéma indisponible"
          message={err instanceof Error ? err.message : "Erreur inconnue"}
        />
      </>
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
    <>
      <div className="ct-eyebrow">
        <Link href={`/swarms/${id}`} className="ct-breadcrumb-link">
          <Chevron direction="left" />Swarm
        </Link>
      </div>

      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: SPACING.lg,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: SPACING.md,
              flexWrap: "wrap",
            }}
          >
            <PageTitle>{swarm.name}</PageTitle>
            {isTemplate ? <span style={templateBadgeStyle}>TEMPLATE</span> : null}
          </div>
          <p className="ct-sub" style={{ maxWidth: PIPELINE_MAX_WIDTH }}>
            {swarm.description || "Aucune description."}
          </p>
          <div
            style={{
              display: "flex",
              gap: SPACING.lg,
              flexWrap: "wrap",
              fontSize: FONT.xs,
              color: "var(--ct-text-muted)",
              marginTop: SPACING.sm,
            }}
          >
            <span>Provider : {modelLabel}</span>
            <span>{swarm.agents.length} agent{swarm.agents.length !== 1 ? "s" : ""}</span>
            <span>{swarm.tasks.length} task{swarm.tasks.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: SPACING.sm, alignItems: "center", flexWrap: "wrap" }}>
          <Link href={`/swarms/${id}`} className="ct-seg-btn primary">
            Lancer une recherche
          </Link>
          <Link href={`/swarms/${id}`} className="ct-seg-btn">
            Voir les runs
          </Link>
          <Link href={`/swarms/${id}`} className="ct-seg-btn">
            Retour au swarm
          </Link>
        </div>
      </div>

      {/* ── 4. Dernier run (aperçu) ──────────────────────────────────────── */}
      {lastRunSummary ? (
        <div className="ct-card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: SPACING.md,
              flexWrap: "wrap",
            }}
          >
            <div className="ct-card-title" style={{ margin: 0 }}>
              Dernier run
            </div>
            <Link
              href={`/swarms/${id}/runs/${lastRunSummary.id}`}
              className="ct-link"
              style={{ fontSize: FONT.sm }}
            >
              Ouvrir le run <Chevron direction="right" />
            </Link>
          </div>
          <div
            style={{
              display: "flex",
              gap: SPACING.lg,
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: SPACING.md,
              fontSize: FONT.sm,
              color: "var(--ct-text-muted)",
            }}
          >
            <Link
              href={`/swarms/${id}/runs/${lastRunSummary.id}`}
              className="ct-link"
              style={{ fontFamily: "var(--font-mono)", fontSize: FONT.sm }}
            >
              {lastRunSummary.id.slice(0, 8)}…
            </Link>
            <StatusBadge status={lastRunSummary.status} />
            <span>début : {formatDate(lastRunSummary.started_at, { withSeconds: true })}</span>
            <span>
              fin :{" "}
              {lastRunSummary.finished_at
                ? formatDate(lastRunSummary.finished_at, { withSeconds: true })
                : "—"}
            </span>
            <span>{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
            <span>
              {(
                lastRunSummary.total_tokens_in + lastRunSummary.total_tokens_out
              ).toLocaleString("en-US")}{" "}
              tok
            </span>
            {recommendation !== "UNKNOWN" ? (
              <RecommendationBadge rec={recommendation} />
            ) : null}
          </div>
          {lastRun && !runHasSteps ? (
            <p
              style={{
                fontSize: FONT.xs,
                color: "var(--ct-text-faint)",
                marginTop: SPACING.md,
                lineHeight: LINE_HEIGHT.tight,
              }}
            >
              {"Détail par agent indisponible : les steps de ce run n'ont pas été journalisés. Le schéma ci-dessous montre le plan d'exécution du swarm."}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="ct-card">
          <p className="ct-placeholder">
            Lance une recherche pour voir les agents opérer en temps réel.
          </p>
        </div>
      )}

      {/* ── 2 + 3. Agent graph + handoff (flux vertical) ─────────────────── */}
      <div
        style={{
          maxWidth: PIPELINE_MAX_WIDTH,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* Input utilisateur */}
        <EndpointNode label="Input utilisateur" tone="neutral">
          {inputFields.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING.xs }}>
              {inputFields.map((f) => (
                <span key={f.key} style={chipStyle}>
                  {f.label}
                  {f.required ? " *" : ""}
                </span>
              ))}
            </div>
          ) : (
            <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.sm }}>
              {"Déclenchement manuel (pas d'inputs structurés)."}
            </span>
          )}
        </EndpointNode>

        {agents.length === 0 ? (
          <>
            <FlowConnector />
            <div className="ct-card">
              <p className="ct-placeholder">{"Ce swarm n'a aucun agent défini."}</p>
            </div>
          </>
        ) : (
          agents.map((agent, idx) => {
            const task = taskForAgent(swarm.tasks, agent);
            const inputs = inputsForAgent(agent, task, swarm.agents, swarm.tasks, inputFields);
            const agentSteps = stepsForAgent(steps, agent);
            const lastStep = agentSteps[agentSteps.length - 1] ?? null;
            return (
              <div key={agent.id ?? agent.name}>
                <FlowConnector
                  label={idx === 0 ? undefined : HANDOFF_LABEL}
                />
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
                <div style={{ marginBottom: SPACING.sm }}>
                  <RecommendationBadge rec={recommendation} size="md" />
                </div>
              ) : null}
              <p
                style={{
                  fontSize: FONT.sm,
                  color: "var(--ct-text-primary)",
                  lineHeight: LINE_HEIGHT.base,
                  margin: 0,
                }}
              >
                {plainExcerpt(lastRun.result_text, REPORT_EXCERPT_CHARS)}
              </p>
              <Link
                href={`/swarms/${id}/runs/${lastRunSummary?.id ?? ""}`}
                className="ct-link"
                style={{ display: "inline-block", marginTop: SPACING.md, fontSize: FONT.sm }}
              >
                Ouvrir le rapport complet <Chevron direction="right" />
              </Link>
            </div>
          ) : (
            <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.sm }}>
              {lastRun
                ? "Run non terminé — le rapport final apparaîtra ici une fois le run complété."
                : "Lance une recherche pour générer le rapport final."}
            </span>
          )}
        </EndpointNode>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Sous-composants (server components, pas d'état)
// ════════════════════════════════════════════════════════════════════════════

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
    <div className="ct-card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: SPACING.md,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.md, minWidth: 0 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: FONT.xs,
              color: "var(--ct-text-faint)",
            }}
          >
            #{order}
          </span>
          <span style={{ fontWeight: FONT_WEIGHT.semibold, color: "var(--ct-text-strong)" }}>
            {agent.name}
          </span>
          <span style={chipStyle}>{agent.role}</span>
        </div>
        {lastStep ? <StatusBadge status={lastStep.status} /> : null}
      </div>

      <div style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", marginTop: SPACING.hair }}>
        {prettyModel(agent.model_name)} · {agent.model_provider}
      </div>

      {task ? (
        <MetaRow label="Task">
          <span style={{ fontWeight: FONT_WEIGHT.medium }}>{task.name}</span>
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
        <div
          style={{
            marginTop: SPACING.md,
            paddingTop: SPACING.md,
            borderTop: "1px solid var(--ct-border-soft)",
          }}
        >
          <div className="ct-eyebrow" style={{ marginBottom: SPACING.hair }}>
            Dernier output
          </div>
          <p
            style={{
              fontSize: FONT.sm,
              color: "var(--ct-text-primary)",
              lineHeight: LINE_HEIGHT.tight,
              margin: 0,
            }}
          >
            {plainExcerpt(lastStep.output_text, STEP_OUTPUT_CHARS)}
          </p>
        </div>
      ) : null}
    </div>
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
    <div
      className="ct-card"
      style={
        tone === "accent"
          ? { borderColor: "var(--ct-border-accent)", background: "var(--ct-accent-soft)" }
          : undefined
      }
    >
      <div className="ct-card-title" style={{ marginBottom: SPACING.sm }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function FlowConnector({ label }: { label?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: `${SPACING.sm}px 0`,
      }}
    >
      <span style={{ color: "var(--ct-text-faint)", fontSize: FONT.lg, lineHeight: 1 }}>↓</span>
      {label ? (
        <span
          style={{
            marginTop: SPACING.xs,
            fontSize: FONT.xs,
            color: "var(--ct-text-faint)",
            fontStyle: "italic",
            textAlign: "center",
            maxWidth: 360,
            lineHeight: LINE_HEIGHT.tight,
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: SPACING.sm }}>
      <div className="ct-eyebrow" style={{ marginBottom: SPACING.hair }}>
        {label}
      </div>
      <div
        style={{
          fontSize: FONT.sm,
          color: "var(--ct-text-primary)",
          lineHeight: LINE_HEIGHT.tight,
        }}
      >
        {children}
      </div>
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

/** "kimi-k2.6" → "Kimi K2.6". Title-case par segment, sans table de mapping. */
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

const templateBadgeStyle: CSSProperties = {
  background: "var(--ct-surface-3)",
  color: "var(--ct-text-muted)",
  padding: `${SPACING.xs}px ${SPACING.s}px`,
  borderRadius: RADIUS.full,
  fontSize: FONT.sm,
  fontWeight: FONT_WEIGHT.bold,
  letterSpacing: LETTER_SPACING.mid,
  textTransform: "uppercase",
  border: "1px solid var(--ct-border)",
};

const chipStyle: CSSProperties = {
  background: "var(--ct-surface-3)",
  color: "var(--ct-text-muted)",
  padding: `${SPACING.hair}px ${SPACING.sm}px`,
  borderRadius: RADIUS.full,
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.medium,
  letterSpacing: LETTER_SPACING.tight,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
