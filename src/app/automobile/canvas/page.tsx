import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { getDecision } from "@/lib/automobile/decisions";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import { DecisionCanvas } from "@/components/automobile/DecisionCanvas";
import { FONT, FONT_WEIGHT, SPACING, RADIUS } from "@/lib/ui/tokens";
import type { SwarmRun } from "@/lib/forms/swarmSchemas";

export const metadata = { title: "Canvas — Automobile" };
export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (e) {
    if (e instanceof OwnerAuthError) redirect("/login?returnTo=/automobile/canvas");
    throw e;
  }

  let run: SwarmRun | null = null;
  let decision: string | null = null;

  try {
    const summaries = await swarmsClient.listRuns(AUTOMOBILE_SWARM_ID, 1, ownerId);
    if (summaries.length > 0) {
      run = await swarmsClient.status(AUTOMOBILE_SWARM_ID, summaries[0].id, ownerId);
      decision = await getDecision(ownerId, run.id);
    }
  } catch {
    // fail-soft: canvas renders with run=null
  }

  const recommendation = extractRecommendation(run?.result_text);

  return (
    <>
      {/* Breadcrumb */}
      <div className="ct-eyebrow">Cockpit · MySwarms</div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: SPACING.lg,
          flexWrap: "wrap",
          marginBottom: SPACING.xxl,
        }}
      >
        <div>
          <div style={{ marginBottom: SPACING.sm }}>
            <Link
              href="/automobile"
              style={{
                fontSize: FONT.sm,
                color: "var(--ct-text-muted)",
                textDecoration: "none",
              }}
            >
              ← Automobile
            </Link>
          </div>
          <h1 className="ct-title">Decision Canvas</h1>
          <p className="ct-sub">
            Visualisation du flow de décision pour la dernière analyse automobile.
          </p>
        </div>
        <div style={{ display: "flex", gap: SPACING.sm, alignSelf: "center", flexWrap: "wrap" }}>
          <Link href="/automobile/nouvelle" className="ct-seg-btn primary" style={{ whiteSpace: "nowrap" }}>
            Nouvelle analyse
          </Link>
          {run?.id ? (
            <Link href={`/automobile/${run.id}`} className="ct-seg-btn" style={{ whiteSpace: "nowrap" }}>
              Rapport complet
            </Link>
          ) : null}
        </div>
      </div>

      {/* Run context banner (if run available) */}
      {run ? (
        <div
          style={{
            background: "var(--ct-surface-0)",
            border: "1px solid var(--ct-border-soft)",
            borderRadius: RADIUS.nav,
            padding: `${SPACING.md}px ${SPACING.xl}px`,
            display: "flex",
            gap: SPACING.xxl,
            flexWrap: "wrap",
            marginBottom: SPACING.xl,
            fontSize: FONT.sm,
          }}
        >
          {[
            { label: "Make", value: typeof run.inputs_json?.make === "string" ? run.inputs_json.make : null },
            { label: "Model", value: typeof run.inputs_json?.model === "string" ? run.inputs_json.model : null },
            { label: "Year", value: run.inputs_json?.year != null ? String(run.inputs_json.year) : null },
            {
              label: "Price",
              value:
                typeof run.inputs_json?.price_eur === "number"
                  ? `${Math.round(run.inputs_json.price_eur).toLocaleString("fr-FR")} €`
                  : null,
            },
            { label: "Statut run", value: run.status },
            { label: "Étapes", value: `${run.steps.length}` },
          ]
            .filter((item) => item.value != null)
            .map(({ label, value }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span
                  style={{
                    fontSize: FONT.xs,
                    color: "var(--ct-text-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: FONT_WEIGHT.bold,
                  }}
                >
                  {label}
                </span>
                <span style={{ color: "var(--ct-text-primary)", fontWeight: FONT_WEIGHT.medium }}>
                  {value}
                </span>
              </div>
            ))}
        </div>
      ) : null}

      {/* Canvas */}
      <DecisionCanvas run={run} decision={decision} recommendation={recommendation} />
    </>
  );
}
