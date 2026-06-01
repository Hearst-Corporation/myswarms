export function getVehicleLabel(inputs: Record<string, unknown>): string {
  const parts: string[] = [];
  if (inputs.year) parts.push(String(inputs.year));
  if (inputs.make) parts.push(String(inputs.make));
  if (inputs.model) parts.push(String(inputs.model));
  return parts.join(" ") || "Véhicule";
}
