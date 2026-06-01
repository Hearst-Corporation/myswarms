"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { SwarmInputForm, type SwarmInputFormState } from "@/components/swarms/SwarmInputForm";
import type { InputField } from "@/lib/swarms/inputSchema";
import type {
  ExtractedVehicleField,
  FieldExtractionMeta,
  VehicleUrlExtraction,
} from "@/lib/automobile/urlExtractor";
import type { DuplicateRunRef } from "@/lib/automobile/dedup";
import { formatDate } from "@/lib/utils/format";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";

type ExtractApiResponse =
  | (VehicleUrlExtraction & { duplicate?: DuplicateRunRef | null })
  | { error?: string };

type KickoffWithInputsAction = (
  prevState: SwarmInputFormState,
  formData: FormData,
) => Promise<SwarmInputFormState>;

interface Props {
  action: KickoffWithInputsAction;
  fields: InputField[];
  /** Pré-remplissage initial (ex: arrivée depuis le sourcing via query params). */
  initialPrefill?: Record<string, string>;
  initialExtractedFields?: Partial<Record<ExtractedVehicleField, FieldExtractionMeta>>;
  /** Doublon détecté côté serveur pour l'URL pré-remplie (flux sourcing). */
  initialDuplicate?: DuplicateRunRef | null;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.sm}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.semibold,
  color: "var(--ct-text-muted)",
  marginBottom: SPACING.xs,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

function fieldSourceLabel(meta: FieldExtractionMeta): string {
  const source =
    meta.source === "json-ld"
      ? "JSON-LD"
      : meta.source === "meta"
      ? "Meta"
      : meta.source === "url"
      ? "URL"
      : meta.source === "text"
      ? "Texte"
      : meta.source === "sourcing"
      ? "Sourcing AutoScout24"
      : "Fallback";
  return `${source} · ${meta.confidence}`;
}

export function AutomobileUrlFirstForm({
  action,
  fields,
  initialPrefill,
  initialExtractedFields,
  initialDuplicate,
}: Props) {
  const [url, setUrl] = useState(initialPrefill?.source_url ?? "");
  const [prefill, setPrefill] = useState<Record<string, string>>(initialPrefill ?? {});
  const [extractedFields, setExtractedFields] = useState<
    Partial<Record<ExtractedVehicleField, FieldExtractionMeta>>
  >(initialExtractedFields ?? {});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateRunRef | null>(initialDuplicate ?? null);
  const [isPending, startTransition] = useTransition();

  const prefillKey = useMemo(() => JSON.stringify(prefill), [prefill]);
  const extractedCount = Object.keys(prefill).filter((key) => key !== "source_url").length;

  function handleExtract(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const targetUrl = url.trim();
    if (!targetUrl) return;
    setError(null);
    setWarnings([]);
    setDuplicate(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/automobile/extract-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
        });
        const data = (await response.json()) as ExtractApiResponse;
        if (!response.ok) {
          const errorPayload = data as { error?: string };
          setError(errorPayload.error ?? "Extraction impossible. Complète le formulaire manuellement.");
          setPrefill({ source_url: targetUrl });
          setExtractedFields({ source_url: { source: "url", confidence: "high" } });
          return;
        }
        const extraction = data as VehicleUrlExtraction & { duplicate?: DuplicateRunRef | null };
        setPrefill(extraction.fields as Record<string, string>);
        setExtractedFields(extraction.extractedFields);
        setWarnings(extraction.warnings);
        setDuplicate(extraction.duplicate ?? null);
      } catch {
        setError("Extraction impossible. Complète le formulaire manuellement.");
        setPrefill({ source_url: targetUrl });
        setExtractedFields({ source_url: { source: "url", confidence: "high" } });
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}>
      <div
        className="ct-card"
        style={{
          padding: `${SPACING.lg}px`,
          background:
            "linear-gradient(135deg, var(--ct-surface-2), var(--ct-surface-1))",
          borderColor: "var(--ct-border-strong)",
        }}
      >
        <form
          onSubmit={handleExtract}
          style={{ display: "flex", flexDirection: "column", gap: SPACING.md }}
        >
          <div>
            <label htmlFor="automobile-url-extractor" style={labelStyle}>
              Coller une URL d&apos;annonce
            </label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: SPACING.sm,
              }}
            >
              <input
                id="automobile-url-extractor"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.autoscout24.fr/..."
                style={inputStyle}
              />
              <button
                type="submit"
                className="ct-seg-btn"
                disabled={isPending || !url.trim()}
                style={{ whiteSpace: "nowrap" }}
              >
                {isPending ? "Extraction…" : "Pré-remplir"}
              </button>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: FONT.xs, color: "var(--ct-text-faint)" }}>
            Optionnel : l&apos;extraction pré-remplit le formulaire, mais tu gardes la
            validation finale avant de consommer des tokens.
          </p>

          {error ? (
            <div
              role="alert"
              style={{
                borderRadius: RADIUS.md,
                border: "1px solid var(--ct-alert-error-border)",
                background: "var(--ct-alert-error-bg)",
                color: "var(--ct-alert-error-text)",
                padding: `${SPACING.sm}px ${SPACING.md}px`,
                fontSize: FONT.xs,
              }}
            >
              {error}
            </div>
          ) : null}

          {duplicate ? (
            <div
              role="status"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: SPACING.sm,
                borderRadius: RADIUS.md,
                border: "1px solid var(--ct-border-accent)",
                background: "var(--ct-accent-soft)",
                padding: `${SPACING.sm}px ${SPACING.md}px`,
                fontSize: FONT.xs,
                color: "var(--ct-text-muted)",
              }}
            >
              <span>
                Cette annonce a déjà été analysée le{" "}
                <strong style={{ color: "var(--ct-text-primary)" }}>
                  {formatDate(duplicate.startedAt)}
                </strong>{" "}
                — relancer consommera de nouveau des tokens.
              </span>
              <Link
                href={`/automobile/${duplicate.runId}`}
                className="ct-link"
                style={{ fontWeight: FONT_WEIGHT.semibold, whiteSpace: "nowrap" }}
              >
                Ouvrir le rapport existant →
              </Link>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div
              style={{
                borderRadius: RADIUS.md,
                border: "1px solid var(--ct-border-accent)",
                background: "var(--ct-accent-soft)",
                padding: `${SPACING.sm}px ${SPACING.md}px`,
                fontSize: FONT.xs,
                color: "var(--ct-text-muted)",
              }}
            >
              {warnings.join(" ")}
            </div>
          ) : null}

          {extractedCount > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING.xs }}>
              {Object.entries(extractedFields).map(([field, meta]) => (
                <span
                  key={field}
                  style={{
                    borderRadius: RADIUS.full,
                    border: "1px solid var(--ct-border)",
                    background: "var(--ct-surface-2)",
                    color: "var(--ct-text-muted)",
                    padding: `${SPACING.hair}px ${SPACING.sm}px`,
                    fontSize: FONT.xs,
                  }}
                >
                  {field === "image_url" ? "photo" : field} · {fieldSourceLabel(meta)}
                </span>
              ))}
            </div>
          ) : null}
        </form>
      </div>

      <div className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SwarmInputForm
          key={prefillKey}
          action={action}
          fields={fields}
          initialValues={prefill}
          extractedFields={extractedFields}
        />
      </div>
    </div>
  );
}
