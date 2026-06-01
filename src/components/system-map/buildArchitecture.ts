import type { MapNode, MapEdge, RunInfo } from "./types";
import { mkNode, mkEdge } from "./graph";

const ACCENT = "var(--ct-accent-strong)";
const OK = "var(--ct-state-ok)";

/**
 * Vue A — architecture réelle de la plateforme (topologie structurelle, pas de
 * la donnée inventée). Les nœuds tables/template sont annotés avec le statut
 * réel du dernier run quand il est disponible.
 */
export function buildArchitecture(run: RunInfo | null): {
  nodes: MapNode[];
  edges: MapEdge[];
} {
  const runStatus = run?.status ?? "—";
  const stepCount = run?.steps ?? 0;

  const nodes: MapNode[] = [
    // ── Session / utilisateur ──
    mkNode("browser", 0, 200, {
      label: "User browser",
      kind: "user",
      sub: "navigateur authentifié",
      desc: "sessions / cookies actifs",
    }),
    mkNode("session", 0, 300, {
      label: "Supabase session",
      kind: "user",
      sub: "@supabase/ssr",
      desc: "cookie httpOnly · refresh middleware",
    }),
    mkNode("owner", 0, 400, {
      label: "owner_id",
      kind: "user",
      sub: "auth.uid()",
      desc: "scope multi-tenant (RLS)",
    }),

    // ── Frontend (Next.js) ──
    mkNode("next", 250, 40, {
      label: "Next.js app",
      kind: "frontend",
      sub: "App Router · :3333 · Vercel",
      detail: {
        title: "Next.js app (BFF)",
        rows: [
          { label: "Runtime", value: "App Router (src/)" },
          { label: "Port dev", value: ":3333" },
          { label: "Hébergement", value: "Vercel" },
        ],
        body: "Front + Backend-for-Frontend. Les routes /api proxient l'engine CrewAI (bearer) et appliquent l'owner-scoping via getOwnerId().",
      },
    }),
    mkNode("workspace", 250, 130, { label: "Workspace", kind: "frontend", sub: "/workspace" }),
    mkNode("swarms", 250, 210, { label: "Swarms", kind: "frontend", sub: "/swarms" }),
    mkNode("swarmDetail", 250, 290, {
      label: "Swarm detail",
      kind: "frontend",
      sub: "/swarms/[id]",
    }),
    mkNode("runDetail", 250, 370, {
      label: "Run detail",
      kind: "frontend",
      sub: "/swarms/[id]/runs/[runId]",
    }),
    mkNode("inputForm", 250, 450, {
      label: "Input form",
      kind: "frontend",
      sub: "SwarmInputForm",
    }),
    mkNode("timeline", 250, 530, {
      label: "Run timeline",
      kind: "frontend",
      sub: "RunTimeline · steps/agent",
    }),
    mkNode("report", 250, 610, {
      label: "Markdown report viewer",
      kind: "report",
      sub: "MarkdownReport",
    }),
    mkNode("autoDash", 250, 700, {
      label: "Automobile dashboard",
      kind: "dashboard",
      sub: "/automobile",
    }),

    // ── Backend (FastAPI CrewAI Engine) ──
    mkNode("engine", 560, 240, {
      label: "FastAPI CrewAI Engine",
      kind: "backend",
      sub: "Railway · :8000",
      detail: {
        title: "FastAPI CrewAI Engine",
        rows: [
          { label: "Hébergement", value: "Railway" },
          { label: "Port dev", value: ":8000" },
          { label: "Auth", value: "bearer (CREWAI_ENGINE_AUTH_TOKEN)" },
        ],
        body: "Orchestration multi-agents (CrewAI Flows + Crews). Appelé en HTTP depuis le BFF Next.js (src/lib/crewai/swarms.ts), persiste dans Supabase via service_role.",
      },
    }),
    mkNode("epKickoff", 560, 350, {
      label: "kickoff endpoint",
      kind: "backend",
      sub: "POST /v1/swarms/:id/kickoff",
    }),
    mkNode("epStatus", 560, 430, {
      label: "status endpoint",
      kind: "backend",
      sub: "GET …/status/:runId",
    }),
    mkNode("epRuns", 560, 510, {
      label: "runs endpoint",
      kind: "backend",
      sub: "GET …/runs",
    }),
    mkNode("epChief", 560, 590, {
      label: "chief endpoints",
      kind: "backend",
      sub: "/v1/crews/chief-of-staff",
    }),

    // ── Data / auth ──
    mkNode("auth", 860, 120, { label: "Supabase Auth", kind: "data", sub: "GoTrue" }),
    mkNode("db", 860, 320, {
      label: "Supabase DB",
      kind: "data",
      sub: "Postgres 17 · RLS",
      detail: {
        title: "Supabase DB",
        rows: [
          { label: "Moteur", value: "Postgres 17" },
          { label: "Sécurité", value: "RLS owner-scoped" },
          { label: "Projet", value: "fxeibmjebvxtoazuyyvz" },
        ],
        body: "Toutes les tables ont une policy RLS. Le moteur écrit via service_role (bypass) ; le front lit owner-scoped (chaîne EXISTS sur swarms.owner_id).",
      },
    }),
    mkNode("template", 860, 520, {
      label: "Automobile — Recherche véhicule",
      kind: "template",
      sub: "is_template=true · owner_id=null",
      desc: "kickoff ✓ · edit/delete ✗",
      detail: {
        title: "Template global Automobile",
        rows: [
          { label: "is_template", value: "true" },
          { label: "owner_id", value: "null (global)" },
          { label: "kickoff", value: "autorisé (run owner-scoped)" },
          { label: "edit / delete", value: "interdits" },
        ],
        body: "Ligne de la table swarms (il n'existe pas de table swarm_templates). Lisible par tout utilisateur via la policy swarms_templates_readable.",
      },
    }),

    // ── Tables ──
    mkNode("tSwarms", 1160, 200, {
      label: "swarms",
      kind: "table",
      sub: "+ swarm_agents · swarm_tasks",
    }),
    mkNode("tRuns", 1160, 320, {
      label: "swarm_runs",
      kind: "table",
      sub: `dernier : ${runStatus}`,
      detail: {
        title: "swarm_runs",
        rows: [
          { label: "Grain", value: "un run" },
          { label: "Dernier run", value: runStatus },
          { label: "Colonnes", value: "status · inputs_json · result_text · tokens" },
        ],
        body: "Insert au démarrage, update final (result_text + status + finished_at).",
      },
    }),
    mkNode("tSteps", 1160, 440, {
      label: "swarm_run_steps",
      kind: "table",
      sub: `${stepCount} steps (dernier run)`,
      detail: {
        title: "swarm_run_steps",
        rows: [
          { label: "Grain", value: "un step" },
          { label: "Dernier run", value: `${stepCount} steps` },
          { label: "FK", value: "run_id · agent_id · task_id" },
        ],
        body: "step_number · input_text · output_text · status. Append-only, RLS via run → swarm → owner.",
      },
    }),
  ];

  const edges: MapEdge[] = [
    mkEdge("e1", "browser", "next", { label: "HTTPS", animated: true, color: ACCENT }),
    mkEdge("e2", "next", "auth", { label: "auth", color: ACCENT }),
    mkEdge("e3", "auth", "owner", { label: "auth.uid()" }),
    mkEdge("e4", "owner", "swarms", { label: "owner_id scope" }),
    mkEdge("e5", "swarms", "swarmDetail", {}),
    mkEdge("e6", "swarmDetail", "inputForm", {}),
    mkEdge("e7", "swarmDetail", "runDetail", {}),
    mkEdge("e8", "next", "engine", { label: "BFF · bearer", animated: true, color: ACCENT }),
    mkEdge("e9", "engine", "epKickoff", {}),
    mkEdge("e10", "engine", "epStatus", {}),
    mkEdge("e11", "engine", "epRuns", {}),
    mkEdge("e12", "engine", "epChief", { dashed: true }),
    mkEdge("e13", "epKickoff", "template", {
      label: "run from template",
      animated: true,
      color: ACCENT,
    }),
    mkEdge("e14", "template", "engine", { label: "CrewAI run", color: ACCENT }),
    mkEdge("e15", "engine", "db", { label: "persist", animated: true, color: OK }),
    mkEdge("e16", "db", "tSwarms", {}),
    mkEdge("e17", "db", "tRuns", { label: "insert run", animated: true, color: OK }),
    mkEdge("e18", "tRuns", "tSteps", { label: "run_id FK · steps", animated: true, color: OK }),
    mkEdge("e19", "epStatus", "runDetail", { label: "poll 5s", animated: true, color: ACCENT }),
    mkEdge("e20", "runDetail", "timeline", {}),
    mkEdge("e21", "runDetail", "report", {}),
    mkEdge("e22", "report", "autoDash", {
      label: "recommendation",
      animated: true,
      color: ACCENT,
    }),
    mkEdge("e23", "template", "tSwarms", { dashed: true, label: "row is_template" }),
    mkEdge("e24", "inputForm", "epKickoff", { dashed: true, label: "POST inputs" }),
  ];

  return { nodes, edges };
}
