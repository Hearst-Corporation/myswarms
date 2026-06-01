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
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";
import { Chevron } from "@/components/ui/Chevron";
import { PageTitle } from "@/components/ui/PageTitle";
import { ErrorLayout } from "@/components/ui/ErrorLayout";
import { LiveIndicator } from "@/components/runs/LiveIndicator";
import { isRunningStatus } from "@/lib/crewai/runStatus";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import type { Recommendation } from "@/lib/swarms/recommendation";
import { getVehicleLabel } from "@/lib/automobile/vehicleLabel";

export const dynamic = "force-dynamic";

const APM_SWARM_ID = "cccccccc-0001-0001-0001-000000000001";

interface PageProps {
  params: Promise<{ runId: string }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const REC_COLORS: Record<Recommendation, { bg: string; border: string; text: string; label: string }> = {
  APPELER:  { bg: "var(--ct-accent-soft)",       border: "var(--ct-border-accent)",  text: "var(--ct-accent-strong)",  label: "Appeler" },
  ATTENDRE: { bg: "var(--ct-surface-2)",          border: "var(--ct-border)",         text: "var(--ct-text-muted)",     label: "Attendre" },
  ÉVITER:   { bg: "var(--ct-alert-error-bg)",     border: "var(--ct-alert-error-border)", text: "var(--ct-alert-error-text)", label: "Éviter" },
  UNKNOWN:  { bg: "var(--ct-surface-2)",          border: "var(--ct-border)",         text: "var(--ct-text-faint)",     label: "—" },
};

function RecommendationBadge({ rec }: { rec: Recommendation }) {
  const c = REC_COLORS[rec];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: SPACING.sm,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: RADIUS.lg,
        padding: `${SPACING.sm}px ${SPACING.lg}px`,
        fontSize: FONT.md,
        fontWeight: FONT_WEIGHT.bold,
        color: c.text,
        letterSpacing: LETTER_SPACING.wide,
        textTransform: "uppercase",
      }}
    >
      {c.label}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="ct-eyebrow" style={{ marginBottom: SPACING.xs }}>{label}</div>
      <div
        style={{
          fontSize: FONT.base,
          color: "var(--ct-text-primary)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          wordBreak: "break-all",
        }}
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
    const run = await swarmsClient.status(APM_SWARM_ID, runId, ownerId);
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
    run = await swarmsClient.status(APM_SWARM_ID, runId, ownerId);
  } catch (err) {
    if (err instanceof SwarmEngineError && err.status === 404) notFound();
    return (
      <>
        <div className="ct-eyebrow">
          <Link href="/automobile" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
            <Chevron direction="left" />Automobile
          </Link>
        </div>
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

  return (
    <>
      <AutoRefresh active={isRunning} seconds={5} />

      {/* Breadcrumb */}
      <div className="ct-eyebrow">
        <Link href="/automobile" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
          <Chevron direction="left" />Automobile
        </Link>
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: SPACING.lg,
          flexWrap: "wrap",
          marginBottom: SPACING.xl,
        }}
      >
        <div>
          <div style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)", marginBottom: SPACING.xs }}>
            Analyse véhicule
          </div>
          <PageTitle>{vehicleLabel}</PageTitle>
          <div
            style={{
              display: "flex",
              gap: SPACING.md,
              alignItems: "center",
              marginTop: SPACING.sm,
              flexWrap: "wrap",
            }}
          >
            <StatusBadge status={run.status} size="md" />
            <span style={{ color: "var(--ct-text-muted)", fontSize: FONT.base }}>
              {run.trigger}
            </span>
            {isRunning && run.status !== "paused_hitl" && <LiveIndicator intervalSeconds={5} />}
          </div>
        </div>

        {/* Nav buttons */}
        <div style={{ display: "flex", gap: SPACING.sm, flexWrap: "wrap" }}>
          <Link
            href="/automobile/nouvelle"
            className="ct-seg-btn"
            style={{ fontSize: FONT.sm }}
          >
            Nouvelle analyse
          </Link>
          <Link
            href="/automobile/historique"
            className="ct-seg-btn"
            style={{ fontSize: FONT.sm }}
          >
            Historique
          </Link>
        </div>
      </div>

      {/* Recommandation badge — affiché uniquement si run terminé et résultat présent */}
      {!isRunning && run.result_text && recommendation !== "UNKNOWN" && (
        <div className="ct-card" style={{ marginBottom: SPACING.lg }}>
          <div className="ct-card-title" style={{ marginBottom: SPACING.md }}>Recommandation</div>
          <RecommendationBadge rec={recommendation} />
        </div>
      )}

      {/* KPIs */}
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
          {
            label: "Cost $",
            value:
              run.total_cost_usd > 0
                ? `$${run.total_cost_usd.toFixed(4)}`
                : run.total_tokens_in + run.total_tokens_out > 0
                ? "—"
                : "$0.0000",
          },
          { label: "Steps", value: run.steps.length },
        ]}
      />

      {/* Metadata */}
      <div className="ct-card">
        <div className="ct-card-title">Détails</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: SPACING.lg,
          }}
        >
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
          {run.langfuse_trace_id ? (
            <Field label="Langfuse trace" value={run.langfuse_trace_id} mono />
          ) : null}
        </div>
      </div>

      {/* Erreur */}
      {run.error_text != null && run.error_text !== "" ? (
        <div
          className="ct-card"
          style={{
            borderColor: "var(--ct-border-accent)",
            background: "var(--ct-accent-soft)",
          }}
        >
          <div className="ct-card-title">Erreur</div>
          <pre
            style={{
              fontSize: FONT.sm,
              fontFamily: "var(--font-mono)",
              color: "var(--ct-text-primary)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {run.error_text}
          </pre>
        </div>
      ) : null}

      {/* Rapport */}
      {run.result_text != null ? (
        <div className="ct-card">
          <div className="ct-card-title">Rapport d&apos;analyse</div>
          {isMarkdown(run.result_text) ? (
            <MarkdownReport
              text={run.result_text}
              title={`analyse-${vehicleLabel.replace(/\s+/g, "-").toLowerCase()}`}
            />
          ) : (
            <pre
              style={{
                background: "var(--ct-surface-2)",
                border: "1px solid var(--ct-border)",
                borderRadius: RADIUS.md,
                padding: SPACING.md,
                fontSize: FONT.sm,
                color: "var(--ct-text-primary)",
                fontFamily: "var(--font-mono)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflow: "auto",
                maxHeight: "var(--ct-result-max-h)",
              }}
            >
              {prettyJsonOrRaw(run.result_text)}
            </pre>
          )}
        </div>
      ) : null}

      {/* Timeline */}
      <div
        className="ct-eyebrow"
        style={{ margin: `${SPACING.xl}px 0 ${SPACING.md}px` }}
      >
        Timeline ({run.steps.length} steps)
      </div>
      <RunTimeline steps={run.steps} status={run.status} />
    </>
  );
}
