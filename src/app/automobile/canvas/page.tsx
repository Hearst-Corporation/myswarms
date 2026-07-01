import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { getDecision } from "@/lib/automobile/decisions";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import { DecisionCanvas } from "@/components/automobile/DecisionCanvas";
import { PageTitle } from "@/components/ui";
import { LinkButton } from "@/components/automobile/LinkButton";
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
      {/* Header */}
      <div className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="mb-2">
            <Link
              href="/automobile"
              className="text-sm text-content-muted hover:text-content"
            >
              ← Automobile
            </Link>
          </div>
          <PageTitle>Decision Canvas</PageTitle>
          <p className="mt-1 text-sm text-content-muted">
            Visualisation du flow de décision pour la dernière analyse automobile.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-center">
          <LinkButton href="/automobile/nouvelle" variant="primary">
            Nouvelle analyse
          </LinkButton>
          {run?.id ? (
            <LinkButton href={`/automobile/${run.id}`} variant="secondary">
              Rapport complet
            </LinkButton>
          ) : null}
        </div>
      </div>

      {/* Run context banner (if run available) */}
      {run ? (
        <div className="mb-8 flex flex-wrap gap-10 rounded-[var(--radius-lg)] bg-canvas px-6 py-4 text-sm ring-1 ring-inset ring-line">
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
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-xs font-bold uppercase tracking-wider text-content-faint">
                  {label}
                </span>
                <span className="font-medium text-content">{value}</span>
              </div>
            ))}
        </div>
      ) : null}

      {/* Canvas */}
      <DecisionCanvas run={run} decision={decision} recommendation={recommendation} />
    </>
  );
}
