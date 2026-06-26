/**
 * Platform Admin Console — server-only data access.
 *
 * Agrège la vue opérateur de la plateforme à partir des tables réelles :
 *   - owners        : auth.users (admin API) + tenant_members + tenants
 *   - swarms        : public.swarms (owner_id)
 *   - runs          : public.swarm_runs + public.chief_run_log (owner_id)
 *   - steps         : public.swarm_run_steps (via run)
 *   - approvals     : public.swarm_run_decisions + public.chief_decisions
 *   - tools/perms   : env mappings (presence-only) — voir ./mappings
 *   - quotas        : ABSENT en DB -> "not_configured" (pas de mensonge de persistance)
 *   - incidents     : DÉRIVÉS safe (mappings manquants, runs failed) — pas d'historique inventé
 *
 * Utilise createAdminClient() (service_role) — appelable UNIQUEMENT depuis du
 * code server protégé par requireSuperAdmin(). Toute valeur sérialisée passe
 * par ./redaction. Aucun secret, aucun contenu privé brut ne sort.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  readMappingSnapshot,
  tenantMappingsFor,
  tenantToolPermissionsFor,
  type MappingSnapshot,
} from "./mappings";
import { maskEmail, redactError, redactPromptPreview, shortId, shortTraceId } from "./redaction";
import type {
  BackendStatus,
  PlatformApproval,
  PlatformIncident,
  PlatformOverview,
  PlatformRunSummary,
  PlatformTenant,
  PlatformTenantDetail,
  SecurityGate,
  TenantQuota,
  TenantStatus,
} from "./types";

/** Politique par défaut : pas d'aperçu de prompt (default-deny). */
const ALLOW_PROMPT_PREVIEW = false;

/** Quota non configuré — aucune table durable n'existe encore. */
function notConfiguredQuota(): TenantQuota {
  return { limit: null, used: 0, remaining: null, period: "none", notConfigured: true };
}

/** Statut tenant dérivé du registre control-plane + métadonnées admin. */
function deriveTenantStatus(opts: {
  controlPlaneStatus?: string | null;
  isInternal: boolean;
  emailConfirmedAt?: string | null;
  isMember: boolean;
}): TenantStatus {
  if (opts.isInternal) return "internal";
  const cps = (opts.controlPlaneStatus ?? "").toLowerCase();
  if (cps === "suspended") return "suspended";
  if (cps === "blocked") return "blocked";
  if (!opts.isMember) return "unknown";
  if (!opts.emailConfirmedAt) return "pending";
  if (cps === "active" || cps === "") return "active";
  return "unknown";
}

interface RawCounts {
  swarms: Map<string, number>;
  runsTotal: Map<string, number>;
  runsActive: Map<string, number>;
  lastActivity: Map<string, string>;
}

/** Charge les counts agrégés par owner en quelques requêtes (pas de N+1). */
async function loadCounts(
  admin: ReturnType<typeof createAdminClient>,
): Promise<RawCounts> {
  const swarms = new Map<string, number>();
  const runsTotal = new Map<string, number>();
  const runsActive = new Map<string, number>();
  const lastActivity = new Map<string, string>();

  const inc = (m: Map<string, number>, k: string | null | undefined) => {
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  const bumpActivity = (k: string | null | undefined, at?: string | null) => {
    if (!k || !at) return;
    const prev = lastActivity.get(k);
    if (!prev || at > prev) lastActivity.set(k, at);
  };

  const [swarmsRes, swarmRunsRes, chiefRes] = await Promise.all([
    admin.from("swarms").select("owner_id").limit(5000),
    admin
      .from("swarm_runs")
      .select("owner_id,status,created_at,started_at,finished_at")
      .limit(5000),
    admin
      .from("chief_run_log")
      .select("owner_id,status,started_at,finished_at")
      .limit(5000),
  ]);

  for (const r of swarmsRes.data ?? []) inc(swarms, r.owner_id);

  const ACTIVE = new Set(["pending", "running", "paused_hitl"]);
  for (const r of swarmRunsRes.data ?? []) {
    inc(runsTotal, r.owner_id);
    if (ACTIVE.has(String(r.status))) inc(runsActive, r.owner_id);
    bumpActivity(r.owner_id, r.finished_at ?? r.started_at ?? r.created_at);
  }
  for (const r of chiefRes.data ?? []) {
    inc(runsTotal, r.owner_id);
    if (ACTIVE.has(String(r.status))) inc(runsActive, r.owner_id);
    bumpActivity(r.owner_id, r.finished_at ?? r.started_at);
  }

  return { swarms, runsTotal, runsActive, lastActivity };
}

/** Incidents dérivés safe pour un owner (aucun contenu sensible). */
function deriveIncidents(
  ownerId: string,
  snap: MappingSnapshot,
  failedRuns: number,
): PlatformIncident[] {
  const out: PlatformIncident[] = [];
  if (!snap.composioOwners.has(ownerId) && snap.composioConfigured) {
    out.push({
      kind: "missing_composio_mapping",
      severity: "warning",
      ownerId,
      message: "Composio configuré globalement mais aucun mapping pour cet owner (fail-closed).",
    });
  }
  if (!snap.telegramOwners.has(ownerId) && snap.telegramConfigured) {
    out.push({
      kind: "missing_telegram_mapping",
      severity: "info",
      ownerId,
      message: "Telegram configuré globalement mais aucun chat mappé pour cet owner (fail-closed).",
    });
  }
  if (!snap.vaultOwners.has(ownerId) && snap.vaultConfigured) {
    out.push({
      kind: "missing_vault_mapping",
      severity: "info",
      ownerId,
      message: "Vault configuré mais aucun namespace mappé pour cet owner (fail-closed).",
    });
  }
  if (failedRuns > 0) {
    out.push({
      kind: "run_failed",
      severity: failedRuns >= 3 ? "critical" : "warning",
      ownerId,
      message: `${failedRuns} run(s) en échec sur la fenêtre récente.`,
    });
  }
  return out;
}

interface OwnerRow {
  id: string;
  email?: string | null;
  emailConfirmedAt?: string | null;
}

/** Liste des owners depuis auth.users (admin API), bornée. */
async function listAuthOwners(
  admin: ReturnType<typeof createAdminClient>,
): Promise<OwnerRow[]> {
  const out: OwnerRow[] = [];
  // listUsers est paginé ; on borne à quelques pages pour rester déterministe.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      out.push({
        id: u.id,
        email: u.email ?? null,
        emailConfirmedAt: u.email_confirmed_at ?? null,
      });
    }
    if (data.users.length < 200) break;
  }
  return out;
}

function isInternalOwner(email?: string | null): boolean {
  const superList = (process.env.SUPER_ADMIN_EMAIL ?? process.env.ALLOWED_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email && superList.includes(email.toLowerCase()));
}

/** Charge la liste agrégée des tenants/owners pour l'overview + table. */
export async function getTenants(): Promise<{
  tenants: PlatformTenant[];
  overview: PlatformOverview;
  backend: BackendStatus;
  gates: SecurityGate[];
}> {
  const admin = createAdminClient();
  const snap = readMappingSnapshot();

  const [owners, counts, membersRes, controlPlaneRes, failedByOwner] = await Promise.all([
    listAuthOwners(admin),
    loadCounts(admin),
    admin.from("tenant_members").select("owner_id,tenant_id,role"),
    admin.from("tenants").select("id,status"),
    loadFailedRunCounts(admin),
  ]);

  const membersByOwner = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    const arr = membersByOwner.get(m.owner_id) ?? [];
    arr.push(m.tenant_id);
    membersByOwner.set(m.owner_id, arr);
  }
  // Statut control-plane: on prend le plus restrictif des tenants de l'owner.
  const cpStatusById = new Map<string, string>();
  for (const t of controlPlaneRes.data ?? []) cpStatusById.set(t.id, String(t.status));

  const tenants: PlatformTenant[] = owners.map((o) => {
    const internal = isInternalOwner(o.email);
    const memberTenants = membersByOwner.get(o.id) ?? [];
    const cpStatuses = memberTenants.map((id) => cpStatusById.get(id) ?? "active");
    const worstCp = cpStatuses.includes("blocked")
      ? "blocked"
      : cpStatuses.includes("suspended")
        ? "suspended"
        : "active";
    const status = deriveTenantStatus({
      controlPlaneStatus: worstCp,
      isInternal: internal,
      emailConfirmedAt: o.emailConfirmedAt,
      isMember: memberTenants.length > 0,
    });
    const failed = failedByOwner.get(o.id) ?? 0;
    const mappings = tenantMappingsFor(o.id, snap);
    const incidents = deriveIncidents(o.id, snap, failed);
    return {
      ownerId: o.id,
      label: maskEmail(o.email) ?? shortId(o.id),
      emailMasked: maskEmail(o.email),
      status,
      tenantIds: memberTenants,
      swarmsCount: counts.swarms.get(o.id) ?? 0,
      runsCount: counts.runsTotal.get(o.id) ?? 0,
      activeRunsCount: counts.runsActive.get(o.id) ?? 0,
      quota: notConfiguredQuota(),
      tools: tenantToolPermissionsFor(o.id, snap),
      mappings,
      incidentsCount: incidents.length,
      lastActivityAt: counts.lastActivity.get(o.id),
      isInternal: internal,
    };
  });

  const overview: PlatformOverview = {
    totalOwners: tenants.length,
    active: tenants.filter((t) => t.status === "active").length,
    pending: tenants.filter((t) => t.status === "pending").length,
    suspended: tenants.filter((t) => t.status === "suspended").length,
    blocked: tenants.filter((t) => t.status === "blocked").length,
    internal: tenants.filter((t) => t.status === "internal").length,
    unconfiguredMappings: tenants.filter(
      (t) =>
        t.mappings.composioEntity === "absent" ||
        t.mappings.telegramChat === "absent" ||
        t.mappings.vaultNamespace === "absent",
    ).length,
    runsToday: await countRunsSince(admin, dayAgoIso()),
    runsWeek: await countRunsSince(admin, weekAgoIso()),
    activeRuns: tenants.reduce((acc, t) => acc + t.activeRunsCount, 0),
  };

  const backend: BackendStatus = {
    engineConfigured: Boolean((process.env.CREWAI_ENGINE_URL ?? process.env.CREWAI_ENGINE_URL_PROD ?? "").trim()),
    cortexConfigured: snap.cortexConfigured,
    schedulerOwnerConfigured: Boolean(snap.schedulerOwnerId),
    syncedAt: nowIso(),
  };

  return { tenants, overview, backend, gates: securityGates(snap) };
}

/** Détail complet d'un owner pour le drawer/page. */
export async function getTenantDetail(ownerId: string): Promise<PlatformTenantDetail | null> {
  const admin = createAdminClient();
  const snap = readMappingSnapshot();

  // Vérifie que l'owner existe côté auth.
  const { data: userData } = await admin.auth.admin.getUserById(ownerId);
  if (!userData?.user) {
    // Owner inconnu côté auth — on ne fabrique pas un faux tenant.
    return null;
  }
  const email = userData.user.email ?? null;
  const internal = isInternalOwner(email);

  const [swarmsRes, membersRes, runs, approvals, failed] = await Promise.all([
    admin
      .from("swarms")
      .select("id,name,is_active,is_template,created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("tenant_members").select("tenant_id").eq("owner_id", ownerId),
    getRuns(ownerId, 40),
    getApprovals(ownerId),
    loadFailedRunCountForOwner(admin, ownerId),
  ]);

  const memberTenants = (membersRes.data ?? []).map((m) => m.tenant_id);
  const status = deriveTenantStatus({
    isInternal: internal,
    emailConfirmedAt: userData.user.email_confirmed_at,
    isMember: memberTenants.length > 0,
  });
  const incidents = deriveIncidents(ownerId, snap, failed);
  const activeRuns = runs.filter((r) =>
    ["pending", "running", "paused_hitl"].includes(r.status),
  ).length;

  return {
    ownerId,
    label: maskEmail(email) ?? shortId(ownerId),
    emailMasked: maskEmail(email),
    status,
    tenantIds: memberTenants,
    swarmsCount: (swarmsRes.data ?? []).length,
    runsCount: runs.length,
    activeRunsCount: activeRuns,
    quota: notConfiguredQuota(),
    tools: tenantToolPermissionsFor(ownerId, snap),
    mappings: tenantMappingsFor(ownerId, snap),
    incidentsCount: incidents.length,
    lastActivityAt: runs[0]?.startedAt,
    isInternal: internal,
    runs,
    approvals,
    incidents,
    swarms: (swarmsRes.data ?? []).map((s) => ({
      id: shortId(s.id),
      label: s.name ?? shortId(s.id),
      isActive: Boolean(s.is_active),
      isTemplate: Boolean(s.is_template),
      createdAt: s.created_at ?? undefined,
    })),
    operatorNotes: [], // foundation audit absente -> aucune note durable
  };
}

/** Runs récents (swarm + chief) pour un owner, rédactés. */
export async function getRuns(ownerId: string, limit = 40): Promise<PlatformRunSummary[]> {
  const admin = createAdminClient();

  const [swarmRunsRes, chiefRes, swarmsRes] = await Promise.all([
    admin
      .from("swarm_runs")
      .select("id,swarm_id,status,started_at,finished_at,created_at,error_text,langfuse_trace_id")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("chief_run_log")
      .select("id,kickoff_id,status,started_at,finished_at,error_text,langfuse_trace_id")
      .eq("owner_id", ownerId)
      .order("started_at", { ascending: false })
      .limit(limit),
    admin.from("swarms").select("id,name").eq("owner_id", ownerId).limit(500),
  ]);

  const swarmLabels = new Map<string, string>();
  for (const s of swarmsRes.data ?? []) swarmLabels.set(s.id, s.name ?? shortId(s.id));

  const fromSwarm: PlatformRunSummary[] = (swarmRunsRes.data ?? []).map((r) => ({
    runId: shortId(r.id),
    ownerId,
    source: "swarm" as const,
    swarmLabel: r.swarm_id ? swarmLabels.get(r.swarm_id) : undefined,
    status: String(r.status),
    startedAt: r.started_at ?? r.created_at ?? undefined,
    updatedAt: r.finished_at ?? undefined,
    durationMs: durationMs(r.started_at, r.finished_at),
    errorClass: redactError(r.error_text),
    traceId: shortTraceId(r.langfuse_trace_id),
    promptPreviewRedacted: redactPromptPreview(null, ALLOW_PROMPT_PREVIEW),
  }));

  const fromChief: PlatformRunSummary[] = (chiefRes.data ?? []).map((r) => ({
    runId: shortId(r.kickoff_id ?? r.id),
    ownerId,
    source: "chief" as const,
    swarmLabel: "Chief of Staff",
    status: String(r.status),
    startedAt: r.started_at ?? undefined,
    updatedAt: r.finished_at ?? undefined,
    durationMs: durationMs(r.started_at, r.finished_at),
    errorClass: redactError(r.error_text),
    traceId: shortTraceId(r.langfuse_trace_id),
  }));

  return [...fromSwarm, ...fromChief]
    .sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))
    .slice(0, limit);
}

/** Approvals/HITL (presence) pour un owner. */
async function getApprovals(ownerId: string): Promise<PlatformApproval[]> {
  const admin = createAdminClient();
  // swarm_run_decisions n'a pas owner_id direct -> join via swarm_runs de l'owner.
  const { data: ownerRuns } = await admin
    .from("swarm_runs")
    .select("id")
    .eq("owner_id", ownerId)
    .limit(500);
  const runIds = (ownerRuns ?? []).map((r) => r.id);

  const out: PlatformApproval[] = [];
  if (runIds.length) {
    const { data: decisions } = await admin
      .from("swarm_run_decisions")
      .select("run_id,decision_id,resolved_at,expires_at,created_at")
      .in("run_id", runIds)
      .limit(200);
    for (const d of decisions ?? []) {
      out.push({
        decisionId: shortId(d.decision_id),
        ownerId,
        runId: shortId(d.run_id),
        source: "swarm",
        status: d.resolved_at ? "resolved" : d.expires_at && d.expires_at < nowIso() ? "expired" : "pending",
        createdAt: d.created_at ?? undefined,
        resolvedAt: d.resolved_at ?? undefined,
      });
    }
  }

  const { data: chiefDecisions } = await admin
    .from("chief_decisions")
    .select("id,chief_run_id,action,created_at")
    .eq("owner_id", ownerId)
    .limit(200);
  for (const d of chiefDecisions ?? []) {
    out.push({
      decisionId: shortId(d.id),
      ownerId,
      runId: shortId(d.chief_run_id),
      source: "chief",
      status: "resolved",
      createdAt: d.created_at ?? undefined,
    });
  }
  return out;
}

// ── helpers comptage / temps ────────────────────────────────────────────────

async function loadFailedRunCounts(
  admin: ReturnType<typeof createAdminClient>,
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  const since = weekAgoIso();
  const [sr, cr] = await Promise.all([
    admin.from("swarm_runs").select("owner_id").eq("status", "failed").gte("created_at", since).limit(5000),
    admin.from("chief_run_log").select("owner_id").eq("status", "failed").gte("started_at", since).limit(5000),
  ]);
  for (const r of [...(sr.data ?? []), ...(cr.data ?? [])]) {
    if (r.owner_id) m.set(r.owner_id, (m.get(r.owner_id) ?? 0) + 1);
  }
  return m;
}

async function loadFailedRunCountForOwner(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
): Promise<number> {
  const since = weekAgoIso();
  const [sr, cr] = await Promise.all([
    admin.from("swarm_runs").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("status", "failed").gte("created_at", since),
    admin.from("chief_run_log").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("status", "failed").gte("started_at", since),
  ]);
  return (sr.count ?? 0) + (cr.count ?? 0);
}

async function countRunsSince(
  admin: ReturnType<typeof createAdminClient>,
  sinceIso: string,
): Promise<number> {
  const [sr, cr] = await Promise.all([
    admin.from("swarm_runs").select("id", { count: "exact", head: true }).gte("created_at", sinceIso),
    admin.from("chief_run_log").select("id", { count: "exact", head: true }).gte("started_at", sinceIso),
  ]);
  return (sr.count ?? 0) + (cr.count ?? 0);
}

function securityGates(snap: MappingSnapshot): SecurityGate[] {
  return [
    { key: "R1", label: "swarm_runs IDOR", status: "enforced", detail: "Runs owner-scopés (R1)." },
    { key: "R3", label: "BFF→Engine JWT interne", status: "enforced", detail: "X-Internal-Auth ; owner_id client ignoré (R3)." },
    { key: "R2", label: "OwnerScope read+write", status: "enforced", detail: "Lectures et écritures owner-scopées (R2)." },
    { key: "R5", label: "Composio/Telegram owner-scopés", status: snap.composioConfigured ? "enforced" : "unknown", detail: "Outils externes scoppés par owner (R5)." },
    { key: "R6", label: "Vault fail-closed", status: "enforced", detail: "VaultSearch owner-scopé/fail-closed (R6)." },
    { key: "BYPASS", label: "DEV_BYPASS_AUTH", status: "enforced", detail: "Fail-closed en prod/preview/Railway/Electron." },
  ];
}

function durationMs(start?: string | null, end?: string | null): number | undefined {
  if (!start || !end) return undefined;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return undefined;
  return b - a;
}

function nowIso(): string {
  return new Date().toISOString();
}
function dayAgoIso(): string {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString();
}
function weekAgoIso(): string {
  return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
}
