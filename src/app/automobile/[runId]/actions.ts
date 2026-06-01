"use server";

import { revalidatePath } from "next/cache";
import { requireOwnerId } from "@/lib/auth/owner";
import { swarmsClient } from "@/lib/crewai/swarms";
import { AUTOMOBILE_SWARM_ID } from "@/lib/automobile/config";
import { upsertDecision } from "@/lib/automobile/decisions";
import { isVehicleDecisionStatus } from "@/lib/automobile/decisionStatus";

/**
 * Server Action — enregistre la décision humaine d'un run Automobile.
 * Owner-scoped (requireOwnerId), revalide les surfaces qui affichent le statut.
 *
 * Sécurité : vérifie que `runId` appartient à l'owner courant avant l'écriture.
 * L'appel `swarmsClient.status` est owner-scopé côté engine → renvoie 404 si le
 * run n'appartient pas à cet owner, ce qui déclenche une exception EngineError
 * et empêche tout oracle d'énumération ou écriture cross-tenant.
 */
export async function setVehicleDecision(
  runId: string,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isVehicleDecisionStatus(status)) {
    return { ok: false, error: "Statut invalide" };
  }
  try {
    const ownerId = await requireOwnerId();
    // Ownership : le run doit appartenir à l'owner (status owner-scopé → 404 sinon).
    await swarmsClient.status(AUTOMOBILE_SWARM_ID, runId, ownerId);
    await upsertDecision(ownerId, runId, status);
    revalidatePath(`/automobile/${runId}`);
    revalidatePath("/automobile");
    revalidatePath("/automobile/historique");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Run introuvable ou accès refusé" };
  }
}
