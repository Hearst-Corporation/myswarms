import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { swarmsClient, SwarmEngineError } from "@/lib/crewai/swarms";
import { parseInputSchema } from "@/lib/swarms/inputSchema";
import { type SwarmInputFormState } from "@/components/swarms/SwarmInputForm";
import { AutomobileUrlFirstForm } from "@/components/automobile/AutomobileUrlFirstForm";
import { Chevron } from "@/components/ui/Chevron";
import { FONT, SPACING } from "@/lib/ui/tokens";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { parsePrefillParams } from "@/lib/automobile/prefill";
import { findRecentRunByUrl, type DuplicateRunRef } from "@/lib/automobile/dedup";

export const metadata = { title: "Nouvelle analyse — Automobile" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NouvelleAnalysePage({ searchParams }: PageProps) {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) redirect("/login?returnTo=/automobile/nouvelle");
    throw err;
  }

  // Pré-remplissage éventuel depuis le sourcing (query params allowlistés).
  const { values: prefillValues, extractedFields: prefillExtracted } =
    parsePrefillParams(await searchParams);

  // Dédup soft : si on arrive avec une URL d'annonce, signale un run récent
  // sur la même annonce (best-effort, ne bloque jamais le flux).
  let prefillDuplicate: DuplicateRunRef | null = null;
  if (prefillValues.source_url) {
    prefillDuplicate = await findRecentRunByUrl(ownerId, prefillValues.source_url);
  }

  // Charger la config du template pour les champs du formulaire.
  // Si le swarm est inaccessible (engine down, swarm absent), on le signale
  // explicitement plutôt que d'afficher un formulaire vide silencieux.
  let inputFields: ReturnType<typeof parseInputSchema> = [];
  let loadFailed = false;
  try {
    const swarm = await swarmsClient.get(AUTOMOBILE_SWARM_ID, ownerId);
    if (swarm) inputFields = parseInputSchema(swarm.config_json as Record<string, unknown>);
    else loadFailed = true;
  } catch {
    loadFailed = true;
  }

  // Server Action
  async function triggerAnalyse(
    _prevState: SwarmInputFormState,
    formData: FormData,
  ): Promise<SwarmInputFormState> {
    "use server";
    const ownerId2 = await requireOwnerId().catch(() => null);
    if (!ownerId2) return { error: "Non authentifié" };

    const inputs: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key !== "trigger" && key !== "swarm_id") inputs[key] = value;
    }

    let runId: string;
    try {
      const result = await swarmsClient.kickoff(
        AUTOMOBILE_SWARM_ID,
        { trigger: "on_demand", inputs },
        ownerId2,
      );
      runId = result.run_id;
    } catch (err) {
      const message =
        err instanceof SwarmEngineError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Échec du lancement";
      return { error: message };
    }
    redirect(`/automobile/${runId}`);
  }

  return (
    <>
      {/* Breadcrumb */}
      <div className="ct-eyebrow">
        <Link href="/automobile" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
          <Chevron direction="left" />Automobile
        </Link>
      </div>

      <div style={{ marginBottom: SPACING.xl }}>
        <h1 className="ct-title">Nouvelle analyse</h1>
        <p
          className="ct-sub"
          style={{ fontSize: FONT.base, color: "var(--ct-text-muted)", marginTop: SPACING.xs }}
        >
          {Object.keys(prefillValues).length > 0
            ? "Champs pré-remplis depuis l'annonce. Vérifie-les avant de lancer l'analyse."
            : "Renseignez les informations du véhicule pour lancer l'analyse."}
        </p>
      </div>

      {loadFailed || inputFields.length === 0 ? (
        <div
          className="ct-card"
          role="alert"
          style={{
            padding: `${SPACING.lx}px`,
            borderColor: "var(--ct-alert-error-border)",
            background: "var(--ct-alert-error-bg)",
          }}
        >
          <div className="ct-card-title" style={{ marginBottom: SPACING.sm }}>
            Formulaire indisponible
          </div>
          <p style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)", marginBottom: SPACING.md }}>
            Le template d&apos;analyse est momentanément inaccessible (moteur
            indisponible ou template introuvable). Réessaie dans un instant.
          </p>
          <Link href="/automobile/nouvelle" className="ct-seg-btn">
            Réessayer
          </Link>
        </div>
      ) : (
        <AutomobileUrlFirstForm
          action={triggerAnalyse}
          fields={inputFields}
          initialPrefill={prefillValues}
          initialExtractedFields={prefillExtracted}
          initialDuplicate={prefillDuplicate}
        />
      )}
    </>
  );
}
