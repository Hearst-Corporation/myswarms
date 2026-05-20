import { StepCard } from "./StepCard";
import type { SwarmRunStep } from "@/lib/forms/swarmSchemas";

interface RunTimelineProps {
  steps: SwarmRunStep[];
  status?: string;
}

function emptyMessage(status?: string): string {
  if (status === "pending") return "En attente de démarrage…";
  if (status === "running" || status === "paused_hitl")
    return "Exécution en cours — première étape imminente…";
  if (status === "failed" || status === "cancelled")
    return "Aucune étape enregistrée (arrêt avant exécution).";
  return "Pas encore d’étapes exécutées.";
}

export function RunTimeline({ steps, status }: RunTimelineProps) {
  if (steps.length === 0) {
    return (
      <div className="ct-card">
        <p className="ct-placeholder">{emptyMessage(status)}</p>
      </div>
    );
  }

  // Ordre croissant par step_number
  const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sorted.map((step) => (
        <StepCard key={step.id} step={step} />
      ))}
    </div>
  );
}
