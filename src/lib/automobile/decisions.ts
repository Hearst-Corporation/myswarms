import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isVehicleDecisionStatus,
  type VehicleDecisionStatus,
} from "@/lib/automobile/decisionStatus";

// Re-export pour les call-sites serveur (pages) qui importent type + fonctions ici.
export type { VehicleDecisionStatus } from "@/lib/automobile/decisionStatus";

/**
 * Accès DB aux décisions (server-only). Lecture/écriture via service_role +
 * filtre owner_id explicite — même modèle de sécurité que le reste de
 * l'environnement Automobile. La RLS de la table protège l'accès direct.
 * Fail-soft : une erreur DB ne casse jamais le rendu (la décision est un
 * enrichissement, pas un bloquant).
 */

/** Décision courante pour un run (null si aucune / erreur). */
export async function getDecision(
  ownerId: string | null,
  runId: string,
): Promise<VehicleDecisionStatus | null> {
  if (!ownerId) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("vehicle_decisions")
      .select("status")
      .eq("owner_id", ownerId)
      .eq("run_id", runId)
      .maybeSingle();
    if (error || !data) return null;
    return isVehicleDecisionStatus(data.status) ? data.status : null;
  } catch {
    return null;
  }
}

/** Décisions pour une liste de runs → Map<run_id, status> (vide si erreur). */
export async function getDecisionsForRuns(
  ownerId: string | null,
  runIds: string[],
): Promise<Map<string, VehicleDecisionStatus>> {
  const out = new Map<string, VehicleDecisionStatus>();
  if (!ownerId || runIds.length === 0) return out;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("vehicle_decisions")
      .select("run_id,status")
      .eq("owner_id", ownerId)
      .in("run_id", runIds);
    if (error || !data) return out;
    for (const row of data as Array<{ run_id: string; status: string }>) {
      if (isVehicleDecisionStatus(row.status)) out.set(row.run_id, row.status);
    }
    return out;
  } catch {
    return out;
  }
}

/** Crée ou met à jour la décision d'un run (upsert sur owner_id+run_id). */
export async function upsertDecision(
  ownerId: string,
  runId: string,
  status: VehicleDecisionStatus,
  note?: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("vehicle_decisions").upsert(
    {
      owner_id: ownerId,
      run_id: runId,
      status,
      note: note ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,run_id" },
  );
  if (error) throw new Error(error.message);
}
