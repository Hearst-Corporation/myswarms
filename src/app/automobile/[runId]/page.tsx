import Link from "next/link";
import { notFound } from "next/navigation";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { getOwnerId } from "@/lib/auth/owner";
import { isValidUuid } from "@/lib/utils/uuid";
import { formatDate } from "@/lib/utils/format";
import { StatusBadge } from "@/components/runs/StatusBadge";
import { AutoRefresh } from "@/components/runs/AutoRefresh";
import { KPIDashboard } from "@/components/swarms/KPIDashboard";
import { RunTimeline } from "@/components/swarms/RunTimeline";
import { MarkdownReport } from "@/components/swarms/MarkdownReport";
import { isMarkdown } from "@/lib/swarms/markdown";
import { fmtPrice } from "@/lib/utils/format";
import { Chevron, PageTitle, ErrorLayout, Card, CardBody } from "@/components/ui";
import { LinkButton } from "@/components/automobile/LinkButton";
import { LiveIndicator } from "@/components/runs/LiveIndicator";
import { isRunningStatus } from "@/lib/crewai/runStatus";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import { RecommendationBadge } from "@/components/swarms/RecommendationBadge";
import { getVehicleLabel } from "@/lib/automobile/vehicleLabel";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { getDecision } from "@/lib/automobile/decisions";
import { VehicleDecisionControl } from "@/components/automobile/VehicleDecisionControl";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ runId: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-content-muted">
        {label}
      </div>
      <div
        className={`break-all text-content ${mono ? "font-[family-name:var(--font-mono)]" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function prettyJsonOrRaw(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps) {
  const { runId } = await params;
  if (!isValidUuid(runId)) return { title: "Analyse introuvable" };
  try {
    const ownerId = await getOwnerId();
    const run = await swarmsClient.status(AUTOMOBILE_SWARM_ID, runId, ownerId);
    const label = getVehicleLabel(run.inputs_json);
    return { title: `${label} · Analyse — MySwarms` };
  } catch {
    return { title: `Analyse ${runId.slice(0, 8)} — MySwarms` };
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function AutomobileRunPage({ params }: PageProps) {
  const { runId } = await params;
  if (!isValidUuid(runId)) notFound();

  const ownerId = await getOwnerId();

  let run;
  try {
    run = await swarmsClient.status(AUTOMOBILE_SWARM_ID, runId, ownerId);
  } catch (err) {
    if (err instanceof SwarmEngineError && err.status === 404) notFound();
    return (
      <>
        <Link
          href="/automobile"
          className="mb-4 inline-flex items-center text-xs font-semibold uppercase tracking-wider text-content-muted hover:text-content"
        >
          <Chevron direction="left" />Automobile
        </Link>
        <ErrorLayout
          title="Analyse introuvable"
          message={err instanceof Error ? err.message : "Erreur inconnue"}
        />
      </>
    );
  }

  const isRunning = isRunningStatus(run.status);
  const vehicleLabel = getVehicleLabel(run.inputs_json);
  const recommendation = extractRecommendation(run.result_text);
  const decision = await getDecision(ownerId, runId);

  const inp = run.inputs_json ?? {};
  const priceEur =
    typeof inp.price_eur === "number" ? inp.price_eur : Number(inp.price_eur) || null;
  const sourceUrl =
    typeof inp.source_url === "string" && inp.source_url.trim() ? inp.source_url : null;

  return (
    <>
      <AutoRefresh active={isRunning} seconds={5} />

      {/* Breadcrumb */}
      <Link
        href="/automobile"
        className="mb-4 inline-flex items-center text-xs font-semibold uppercase tracking-wider text-content-muted hover:text-content"
      >
        <Chevron direction="left" />Automobile
      </Link>

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="mb-1 text-sm text-content-muted">Analyse véhicule</div>
          <PageTitle>{vehicleLabel}</PageTitle>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <StatusBadge status={run.status} size="md" />
            <span className="text-content-muted">{run.trigger}</span>
            {isRunning && run.status !== "paused_hitl" && <LiveIndicator intervalSeconds={5} />}
          </div>
        </div>

        {/* Nav buttons */}
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/automobile/nouvelle" variant="secondary">
            Nouvelle analyse
          </LinkButton>
          <LinkButton href="/automobile/historique" variant="secondary">
            Historique
          </LinkButton>
        </div>
      </div>

      {/* Recommandation badge — affiché uniquement si run terminé et résultat présent */}
      {!isRunning && run.result_text && recommendation !== "UNKNOWN" && (
        <Card className="mb-6">
          <CardBody>
            <h3 className="mb-4 text-sm font-semibold text-content-strong">Recommandation</h3>
            <RecommendationBadge rec={recommendation} size="md" />
          </CardBody>
        </Card>
      )}

      {/* Décision humaine */}
      <Card className="mb-6">
        <CardBody>
          <h3 className="mb-4 text-sm font-semibold text-content-strong">Décision</h3>
          <VehicleDecisionControl runId={runId} initial={decision} />
        </CardBody>
      </Card>

      {/* KPIs */}
      <div className="mb-6">
        <KPIDashboard
          kpis={[
            {
              label: "Tokens in",
              value: run.total_tokens_in.toLocaleString("en-US"),
              accent: true,
            },
            {
              label: "Tokens out",
              value: run.total_tokens_out.toLocaleString("en-US"),
            },
            { label: "Steps", value: run.steps.length },
          ]}
        />
      </div>

      {/* Metadata */}
      <Card className="mb-6">
        <CardBody>
          <h3 className="mb-4 text-sm font-semibold text-content-strong">Détails</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
            <Field
              label="Démarré"
              value={formatDate(run.started_at, { withSeconds: true, withYear: true })}
            />
            <Field
              label="Terminé"
              value={
                run.finished_at
                  ? formatDate(run.finished_at, { withSeconds: true, withYear: true })
                  : "—"
              }
            />
            {priceEur != null ? (
              <Field label="Prix" value={fmtPrice(priceEur)} />
            ) : null}
            {sourceUrl ? (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-content-muted">
                  Source
                </div>
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-accent hover:text-accent-strong"
                >
                  Voir l&apos;annonce ↗
                </a>
              </div>
            ) : null}
            {run.langfuse_trace_id ? (
              <Field label="Langfuse trace" value={run.langfuse_trace_id} mono />
            ) : null}
          </div>
        </CardBody>
      </Card>

      {/* Erreur */}
      {run.error_text != null && run.error_text !== "" ? (
        <Card className="mb-6 bg-accent/10 ring-accent/40">
          <CardBody>
            <h3 className="mb-4 text-sm font-semibold text-content-strong">Erreur</h3>
            <pre className="whitespace-pre-wrap break-words font-[family-name:var(--font-mono)] text-sm text-content">
              {run.error_text}
            </pre>
          </CardBody>
        </Card>
      ) : null}

      {/* Rapport */}
      {run.result_text != null ? (
        <Card className="mb-6">
          <CardBody>
            <h3 className="mb-4 text-sm font-semibold text-content-strong">
              Rapport d&apos;analyse
            </h3>
            {isMarkdown(run.result_text) ? (
              <MarkdownReport
                text={run.result_text}
                title={`analyse-${vehicleLabel.replace(/\s+/g, "-").toLowerCase()}`}
              />
            ) : (
              <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-surface-2 p-4 font-[family-name:var(--font-mono)] text-sm text-content ring-1 ring-inset ring-line">
                {prettyJsonOrRaw(run.result_text)}
              </pre>
            )}
          </CardBody>
        </Card>
      ) : null}

      {/* Timeline */}
      <div className="mb-4 mt-8 text-xs font-semibold uppercase tracking-wider text-content-muted">
        Timeline ({run.steps.length} steps)
      </div>
      <RunTimeline steps={run.steps} status={run.status} />
    </>
  );
}
