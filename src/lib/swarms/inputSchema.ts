/**
 * Convention input_schema pour les swarm templates.
 *
 * Format stocké dans config_json.inputs_schema :
 * {
 *   "make": "string — marque (ex: BMW)",
 *   "year": "integer — année de première immatriculation",
 *   "price_eur": "number — prix annonce en euros",
 *   "source_url": "string — URL de l'annonce",
 *   "notes": "string — remarques libres...",
 * }
 *
 * Convention de déduction depuis la description :
 *   - commence par "integer" ou "number" → champ number
 *   - contient "URL" → champ url (input type=url)
 *   - contient "textarea" ou longueur > 60 → textarea
 *   - sinon → text
 *
 * Les champs "required" sont déduits de la présence de " — required" dans la description
 * OU si le champ est listé dans config_json.required_inputs (tableau de strings).
 */

export type FieldType = "text" | "number" | "url" | "textarea";

export interface InputField {
  key: string;
  label: string;
  description: string;
  type: FieldType;
  required: boolean;
  placeholder: string;
}

/** Extrait les champs de inputs_schema depuis config_json. Retourne [] si absent. */
export function parseInputSchema(
  configJson: Record<string, unknown>,
  requiredOverride?: string[],
): InputField[] {
  const raw = configJson["inputs_schema"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  const requiredFields = new Set<string>(
    Array.isArray(configJson["required_inputs"])
      ? (configJson["required_inputs"] as string[])
      : requiredOverride ?? [],
  );

  return Object.entries(raw as Record<string, string>).map(([key, desc]) => {
    const description = typeof desc === "string" ? desc : String(desc);
    const lower = description.toLowerCase();

    let type: FieldType = "text";
    if (lower.startsWith("integer") || lower.startsWith("number")) {
      type = "number";
    } else if (lower.includes("url")) {
      type = "url";
    } else if (lower.includes("textarea") || description.length > 80) {
      type = "textarea";
    }

    const label = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    // Extract placeholder hint from "— <hint>" in description
    const hintMatch = description.match(/—\s*(.+)/);
    const placeholder = hintMatch ? hintMatch[1].slice(0, 60) : "";

    const required =
      requiredFields.has(key) || description.toLowerCase().includes("required");

    return { key, label, description, type, required, placeholder };
  });
}
