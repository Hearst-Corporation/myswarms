import Link from "next/link";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { parseInputSchema } from "@/lib/swarms/inputSchema";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import { PageTitle } from "@/components/ui/PageTitle";
import { Chevron } from "@/components/ui/Chevron";
import { SystemMap } from "@/components/system-map/SystemMap";
import type {
  SystemMapData,
  AgentSlot,
  InputField,
  RunInfo,
  MapStatus,
} from "@/components/system-map/types";
import type { SwarmRecord, SwarmRun } from "@/lib/forms/swarmSchemas";
import { SPACING } from "@/lib/ui/tokens";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Map — MySwarms",
};

// Template Automobile global (seedé, id stable) — overridable par env.
const AUTOMOBILE_TEMPLATE_ID =
  process.env.NEXT_PUBLIC_AUTOMOBILE_TEMPLATE_ID ??
  "cccccccc-0001-0001-0001-000000000001";
// Nom canonique (le champ swarms.name stocké est corrompu en base — cf. rapport).
const TEMPLATE_DISPLAY_NAME =
  process.env.NEXT_PUBLIC_AUTOMOBILE_TEMPLATE_NAME ?? "Automobile — Recherche véhicule";
// Le template global subit un 404 moteur intermittent (résolution owner-scoped) → retry.
const FETCH_RETRIES = Number(process.env.NEXT_PUBLIC_SYSTEM_MAP_RETRIES ?? "5");
const REPORT_EXCERPT_CHARS = 360;
const OUTPUT_EXCERPT_CHARS = 320;

async function getSwarmRetry(
  id: string,
  ownerId: string | null,
): Promise<SwarmRecord | null> {
  for (let i = 0; i < FETCH_RETRIES; i++) {
    try {
      return await swarmsClient.get(id, ownerId);
    } catch (err) {
      if (err instanceof SwarmEngineError && err.status === 404) continue;
      throw err;
    }
  }
  return null;
}

async function statusRetry(
  id: string,
  runId: string,
  ownerId: string | null,
): Promise<SwarmRun | null> {
  for (let i = 0; i < FETCH_RETRIES; i++) {
    try {
      return await swarmsClient.status(id, runId, ownerId);
    } catch (err) {
      if (err instanceof SwarmEngineError && err.status === 404) continue;
      throw err;
    }
  }
  return null;
}

export default async function SystemMapPage() {
  const ownerId = await getOwnerId();

  let swarm: SwarmRecord | null = null;
  let loadError: string | null = null;
  try {
    swarm = await getSwarmRetry(AUTOMOBILE_TEMPLATE_ID, ownerId);
    if (!swarm) loadError = "template introuvable (engine 404)";
  } catch (err) {
    loadError = err instanceof Error ? err.message : "erreur engine";
  }

  // Le dernier run ne dépend pas du record swarm — on tente même si get() a échoué.
  let lastRun: SwarmRun | null = null;
  try {
    const runs = await swarmsClient.listRuns(AUTOMOBILE_TEMPLATE_ID, 10, ownerId);
    const last = [...runs].sort(
      (a, b) =>
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
    )[0];
    if (last) lastRun = await statusRetry(AUTOMOBILE_TEMPLATE_ID, last.id, ownerId);
  } catch {
    // fail-soft : la vue agents sera dégradée
  }

  const data = buildData(swarm, lastRun, loadError);

  return (
    <>
      <div className="ct-eyebrow">
        <Link href="/swarms" className="ct-breadcrumb-link">
          <Chevron direction="left" />Swarms
        </Link>
      </div>
      <PageTitle>System Map</PageTitle>
      <p className="ct-sub" style={{ marginBottom: SPACING.lg }}>
        Cartographie 2D de la plateforme et du template Automobile — branchée sur
        le dernier run réel.
      </p>
      <SystemMap data={data} />
    </>
  );
}

// ── Construction du payload (données réelles uniquement) ─────────────────────

function buildData(
  swarm: SwarmRecord | null,
  lastRun: SwarmRun | null,
  loadError: string | null,
): SystemMapData {
  const steps = lastRun?.steps ?? [];
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);

  // Ordre des agents : design (position) si swarm dispo, sinon 1re apparition dans les steps.
  type Slot = { name: string; role: string; provider: string; model: string; id?: string };
  let order: Slot[] = [];
  if (swarm && swarm.agents.length > 0) {
    order = [...swarm.agents]
      .sort(
        (a, b) =>
          a.position_y - b.position_y ||
          a.position_x - b.position_x ||
          a.name.localeCompare(b.name),
      )
      .map((a) => ({
        name: a.name,
        role: a.role,
        provider: a.model_provider,
        model: a.model_name,
        id: a.id,
      }));
  } else {
    const seen = new Set<string>();
    for (const s of sorted) {
      const n = s.agent_name ?? "Agent";
      if (!seen.has(n)) {
        seen.add(n);
        order.push({ name: n, role: "—", provider: "—", model: "—" });
      }
    }
  }

  const tasks = swarm?.tasks ?? [];
  const agents: AgentSlot[] = order.map((a) => {
    const task = a.id ? tasks.find((t) => t.agent_id === a.id) ?? null : null;
    const mine = sorted.filter((s) =>
      a.id && s.agent_id ? s.agent_id === a.id : s.agent_name === a.name,
    );
    const last = mine[mine.length - 1] ?? null;
    const tokens = mine.reduce((acc, s) => acc + s.tokens_in + s.tokens_out, 0);
    return {
      name: a.name,
      role: a.role,
      provider: a.provider,
      model: a.model,
      taskName: task?.name ?? null,
      objective: task?.description ?? null,
      expectedOutput: task?.expected_output ?? null,
      status: deriveStatus(mine.map((s) => s.status)),
      statusRaw: last?.status ?? "—",
      outputExcerpt: last?.output_text ? plainExcerpt(last.output_text, OUTPUT_EXCERPT_CHARS) : null,
      tokens: tokens || null,
    };
  });

  // Champs d'input réels (valeurs du dernier run + labels du schéma).
  const inputs = (lastRun?.inputs_json ?? {}) as Record<string, unknown>;
  const declared = swarm
    ? parseInputSchema(swarm.config_json as Record<string, unknown>)
    : [];
  const inputFields: InputField[] = declared.length
    ? declared
        .filter((f) => inputs[f.key] !== undefined && inputs[f.key] !== "")
        .map((f) => ({ key: f.key, label: f.label, value: String(inputs[f.key]) }))
    : Object.entries(inputs).map(([k, v]) => ({
        key: k,
        label: humanize(k),
        value: String(v),
      }));

  const run: RunInfo | null = lastRun
    ? {
        id: lastRun.id,
        status: lastRun.status,
        startedAt: lastRun.started_at,
        finishedAt: lastRun.finished_at ?? null,
        tokensIn: lastRun.total_tokens_in,
        tokensOut: lastRun.total_tokens_out,
        steps: steps.length,
        recommendation: extractRecommendation(lastRun.result_text),
      }
    : null;

  return {
    available: !!swarm,
    swarmId: AUTOMOBILE_TEMPLATE_ID,
    displayName: TEMPLATE_DISPLAY_NAME,
    storedName: swarm?.name ?? null,
    isTemplate: swarm?.is_template ?? true,
    inputFields,
    agents,
    run,
    reportExcerpt: lastRun?.result_text
      ? plainExcerpt(lastRun.result_text, REPORT_EXCERPT_CHARS)
      : null,
    loadError,
  };
}

function deriveStatus(statuses: string[]): MapStatus {
  if (statuses.length === 0) return "static";
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "running" || s === "pending")) return "running";
  if (statuses.every((s) => s === "completed")) return "completed";
  return "static";
}

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

function plainExcerpt(md: string, max: number): string {
  const plain = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*_>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(plain, max);
}
