/**
 * Convention input_schema pour les swarm templates.
 *
 * Format stocké dans config_json :
 *
 *   inputs_schema   : Record<string, string>   — clé → description
 *   required_inputs : string[]                 — champs obligatoires
 *   field_order     : string[]                 — ordre d'affichage (optionnel)
 *   field_options   : Record<string, string[]> — options <select> (optionnel)
 *
 * Déduction du type depuis la description :
 *   "integer" | "number" → number input
 *   "URL"                → url input (type=url)
 *   textarea | desc >80  → textarea
 *   options présentes    → select (priorité sur le type textuel)
 *   sinon               → text
 */

export type FieldType = "text" | "number" | "url" | "textarea" | "select";

export interface InputField {
  key: string;
  label: string;
  description: string;
  type: FieldType;
  required: boolean;
  placeholder: string;
  /** Options for <select> — present only when type === "select" */
  options?: string[];
}

/** Extrait les champs de inputs_schema depuis config_json.
 *  Respecte field_order si défini, sinon ordre des clés JSON.
 *  Retourne [] si inputs_schema absent.
 */
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

  const fieldOptions: Record<string, string[]> =
    configJson["field_options"] !== null &&
    typeof configJson["field_options"] === "object" &&
    !Array.isArray(configJson["field_options"])
      ? (configJson["field_options"] as Record<string, string[]>)
      : {};

  const fieldOrder: string[] = Array.isArray(configJson["field_order"])
    ? (configJson["field_order"] as string[])
    : [];

  const schema = raw as Record<string, string>;

  // Build ordered key list: declared order first, then any remaining keys
  const allKeys = Object.keys(schema);
  const ordered = [
    ...fieldOrder.filter((k) => allKeys.includes(k)),
    ...allKeys.filter((k) => !fieldOrder.includes(k)),
  ];

  return ordered.map((key) => {
    const desc = schema[key];
    const description = typeof desc === "string" ? desc : String(desc);
    const lower = description.toLowerCase();
    const opts = fieldOptions[key];
    const hasOptions = Array.isArray(opts) && opts.length > 0;

    let type: FieldType;
    if (hasOptions) {
      type = "select";
    } else if (lower.startsWith("integer") || lower.startsWith("number")) {
      type = "number";
    } else if (lower.includes("url")) {
      type = "url";
    } else if (lower.includes("textarea") || description.length > 80) {
      type = "textarea";
    } else {
      type = "text";
    }

    const label = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const hintMatch = description.match(/—\s*(.+)/);
    const placeholder = hintMatch ? hintMatch[1].slice(0, 60) : "";

    const required =
      requiredFields.has(key) || description.toLowerCase().includes("required");

    return {
      key,
      label,
      description,
      type,
      required,
      placeholder,
      ...(hasOptions ? { options: opts } : {}),
    };
  });
}
