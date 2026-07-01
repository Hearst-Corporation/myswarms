import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { isValidUuid } from "@/lib/utils/uuid";
import { formatDate } from "@/lib/utils/format";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { KickoffForm, type KickoffFormState } from "@/components/runs/KickoffForm";
import { SwarmInputForm, type SwarmInputFormState } from "@/components/swarms/SwarmInputForm";
import { SwarmArchiveButton } from "@/components/swarms/SwarmArchiveButton";
import { parseInputSchema } from "@/lib/swarms/inputSchema";
import type { SwarmRunSummary } from "@/lib/forms/swarmSchemas";
import {
  PageTitle,
  Chevron,
  ErrorLayout,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Badge,
  SectionLabel,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  EmptyState,
} from "@/components/ui";
import { SwarmTemplateProvider } from "@/lib/swarms/templateContext";

const ALLOWED_TRIGGERS = ["morning", "evening", "intraday", "on_demand", "webhook"] as const;
type Trigger = (typeof ALLOWED_TRIGGERS)[number];

const BREADCRUMB =
  "inline-flex items-center text-xs font-semibold uppercase tracking-wider text-content-muted hover:text-content";
const SECONDARY_LINK =
  "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-3 px-3 " +
  "text-xs font-semibold text-content ring-1 ring-inset ring-line transition-colors hover:bg-elevated";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SwarmDetailPage({ params }: PageProps) {
  const { id } = await params;
  if (!isValidUuid(id)) notFound();

  // Server Action — kickoff simple (sans inputs structurés)
  async function triggerKickoff(
    _prevState: KickoffFormState,
    formData: FormData,
  ): Promise<KickoffFormState> {
    "use server";
    const raw = formData.get("trigger");
    const trigger: Trigger = (ALLOWED_TRIGGERS as readonly string[]).includes(String(raw))
      ? (raw as Trigger)
      : "on_demand";

    let runId: string;
    try {
      const ownerId = await getOwnerId();
      const result = await swarmsClient.kickoff(id, { trigger }, ownerId);
      runId = result.run_id;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to kickoff" };
    }
    redirect(`/swarms/${id}/runs/${runId}`);
  }

  // Server Action — kickoff avec inputs structurés depuis SwarmInputForm
  async function triggerKickoffWithInputs(
    _prevState: SwarmInputFormState,
    formData: FormData,
  ): Promise<SwarmInputFormState> {
    "use server";
    const trigger: Trigger = "on_demand";

    // Collecter tous les champs du formulaire (hors trigger) en inputs JSON
    const inputs: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key === "trigger") continue;
      const str = typeof value === "string" ? value.trim() : "";
      if (!str) continue;
      // Convertir les nombres si la valeur est numérique
      const num = Number(str);
      inputs[key] = !isNaN(num) && str !== "" ? num : str;
    }

    let runId: string;
    try {
      const ownerId = await getOwnerId();
      const result = await swarmsClient.kickoff(id, { trigger, inputs }, ownerId);
      runId = result.run_id;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Failed to kickoff" };
    }
    redirect(`/swarms/${id}/runs/${runId}`);
  }

  let swarm;
  try {
    const ownerId = await getOwnerId();
    swarm = await swarmsClient.get(id, ownerId);
  } catch (err) {
    if (err instanceof SwarmEngineError && err.status === 404) notFound();
    return (
      <div className="flex flex-col gap-6">
        <Link href="/swarms" className={BREADCRUMB}>
          <Chevron direction="left" />Swarms
        </Link>
        <ErrorLayout
          title="Swarm not found"
          message={err instanceof Error ? err.message : "Unknown error"}
        />
      </div>
    );
  }

  let recentRuns: SwarmRunSummary[] = [];
  let listRunsError: string | null = null;
  try {
    const ownerId = await getOwnerId();
    recentRuns = await swarmsClient.listRuns(id, 10, ownerId);
  } catch (err) {
    listRunsError = err instanceof Error ? err.message : "Failed to load runs";
  }

  const totalRuns = recentRuns.length;
  const activeRuns = recentRuns.filter((r) => r.status === "running").length;
  const succeededRuns = recentRuns.filter((r) => r.status === "completed").length;

  // Parse input schema from config_json.inputs_schema.
  // required_inputs comes from config_json.required_inputs (set per-template in DB).
  // No hardcode here — all required fields are declared in the template's config_json.
  const inputFields = parseInputSchema(swarm.config_json as Record<string, unknown>);
  const hasInputSchema = inputFields.length > 0;
  const isTemplate = swarm.is_template === true;

  return (
    <SwarmTemplateProvider isTemplate={isTemplate}>
      <div className="flex flex-col gap-6">
        <Link href="/swarms" className={BREADCRUMB}>
          <Chevron direction="left" />Swarms
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <PageTitle>{swarm.name}</PageTitle>
              {isTemplate ? (
                <Badge tone="neutral">TEMPLATE</Badge>
              ) : swarm.is_active === false ? (
                <Badge tone="accent">Archived</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-content-muted">
              {swarm.description || "No description."}
            </p>
            <Link
              href={`/swarms/${id}/schema`}
              className="mt-2 inline-flex items-center text-sm text-accent hover:text-accent-strong"
            >
              Voir le schéma des agents <Chevron direction="right" />
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isTemplate ? (
              /* Template global — pas d'Edit ni d'Archive utilisateur.
                 Le kickoff est géré par SwarmInputForm ou KickoffForm ci-dessous. */
              <span className="text-xs italic text-content-muted">
                Global template — read-only
              </span>
            ) : swarm.is_active === false ? (
              /* Swarm archivé — actions désactivées */
              <>
                <span
                  aria-disabled="true"
                  title="Archived swarm — disabled"
                  className="pointer-events-none inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-3 px-3 text-xs font-semibold text-content opacity-50 ring-1 ring-inset ring-line"
                >
                  Edit
                </span>
                <span className="text-xs italic text-content-muted">
                  Archived — cannot be triggered
                </span>
              </>
            ) : (
              /* Swarm utilisateur actif — Edit + Archive + KickoffForm simple */
              <>
                <Link href={`/swarms/${id}/edit`} className={SECONDARY_LINK}>
                  Edit
                </Link>
                <SwarmArchiveButton swarmId={id} swarmName={swarm.name} />
                {!hasInputSchema && <KickoffForm action={triggerKickoff} />}
              </>
            )}
          </div>
        </div>

        <KPIDashboard
          kpis={[
            { label: "Agents", value: swarm.agents.length, accent: true },
            { label: "Tasks", value: swarm.tasks.length },
            { label: "Recent runs", value: totalRuns },
            { label: "Active", value: activeRuns },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle>Composition</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-8 md:grid-cols-2">
            <div>
              <SectionLabel text="Agents" />
              {swarm.agents.length === 0 ? (
                <p className="text-sm text-content-faint">No agent.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {swarm.agents.map((a) => (
                    <li key={a.id ?? a.name} className="py-2">
                      <div className="font-semibold text-content-strong">{a.name}</div>
                      <div className="text-xs text-content-muted">
                        {a.role} · {a.model_provider}/{a.model_name}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <SectionLabel text="Tasks" />
              {swarm.tasks.length === 0 ? (
                <p className="text-sm text-content-faint">No task.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {swarm.tasks.map((t) => (
                    <li key={t.id ?? t.name} className="py-2">
                      <div className="font-semibold text-content-strong">{t.name}</div>
                      <div className="text-xs text-content-muted">
                        {t.description.slice(0, 80)}
                        {t.description.length > 80 ? "…" : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Structured input form — shown only when input_schema is present */}
        {hasInputSchema && swarm.is_active !== false && (
          <Card>
            <CardHeader>
              <CardTitle>Run inputs</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="mb-4 text-sm text-content-muted">
                Fill in the fields and click <strong>Run now</strong> to{" "}
                {isTemplate ? "launch a run from this template" : "launch this swarm"}.
                {isTemplate && (
                  <span className="ml-2 text-content-faint">
                    Your run will be owner-scoped.
                  </span>
                )}
              </p>
              <SwarmInputForm action={triggerKickoffWithInputs} fields={inputFields} />
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent runs</CardTitle>
            {succeededRuns > 0 && totalRuns > 0 ? (
              <span className="text-xs text-content-muted">
                {succeededRuns}/{totalRuns} success
              </span>
            ) : null}
          </CardHeader>
          {listRunsError ? (
            <CardBody>
              <p className="text-sm text-danger">{listRunsError}</p>
            </CardBody>
          ) : recentRuns.length === 0 ? (
            <CardBody>
              <EmptyState
                title="No run yet"
                description="Trigger one with the button above."
              />
            </CardBody>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Run</TH>
                  <TH>Trigger</TH>
                  <TH>Status</TH>
                  <TH>Started</TH>
                  <TH>Finished</TH>
                  <TH>Tokens</TH>
                </TR>
              </THead>
              <TBody>
                {recentRuns.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link
                        href={`/swarms/${id}/runs/${r.id}`}
                        className="font-mono text-sm text-accent hover:text-accent-strong"
                      >
                        {r.id.slice(0, 8)}…
                      </Link>
                    </TD>
                    <TD>{r.trigger}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="text-content-muted">{formatDate(r.started_at)}</TD>
                    <TD className="text-content-muted">
                      {r.finished_at ? formatDate(r.finished_at) : "—"}
                    </TD>
                    <TD className="text-content-muted">
                      {r.total_tokens_in + r.total_tokens_out}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </SwarmTemplateProvider>
  );
}
