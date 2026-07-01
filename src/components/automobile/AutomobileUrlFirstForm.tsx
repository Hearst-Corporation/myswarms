"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { SwarmInputForm, type SwarmInputFormState } from "@/components/swarms/SwarmInputForm";
import { Button, Card, CardBody, Input, Label } from "@/components/ui";
import type { InputField } from "@/lib/swarms/inputSchema";
import type {
  ExtractedVehicleField,
  FieldExtractionMeta,
  VehicleUrlExtraction,
} from "@/lib/automobile/urlExtractor";
import type { DuplicateRunRef } from "@/lib/automobile/dedup";
import { formatDate } from "@/lib/utils/format";

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
    <div className="flex flex-col gap-6">
      <Card className="bg-gradient-to-br from-surface-2 to-surface ring-line-strong">
        <CardBody>
          <form onSubmit={handleExtract} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="automobile-url-extractor">
                Coller une URL d&apos;annonce
              </Label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  id="automobile-url-extractor"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.autoscout24.fr/..."
                />
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isPending || !url.trim()}
                  className="whitespace-nowrap"
                >
                  {isPending ? "Extraction…" : "Pré-remplir"}
                </Button>
              </div>
            </div>

            <p className="text-xs text-content-faint">
              Optionnel : l&apos;extraction pré-remplit le formulaire, mais tu gardes la
              validation finale avant de consommer des tokens.
            </p>

            {error ? (
              <div
                role="alert"
                className="rounded-[var(--radius-md)] bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-inset ring-danger/25"
              >
                {error}
              </div>
            ) : null}

            {duplicate ? (
              <div
                role="status"
                className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-accent/10 px-3 py-2 text-xs text-content-muted ring-1 ring-inset ring-accent/30"
              >
                <span>
                  Cette annonce a déjà été analysée le{" "}
                  <strong className="text-content-strong">
                    {formatDate(duplicate.startedAt)}
                  </strong>{" "}
                  — relancer consommera de nouveau des tokens.
                </span>
                <Link
                  href={`/automobile/${duplicate.runId}`}
                  className="whitespace-nowrap font-semibold text-accent hover:text-accent-strong"
                >
                  Ouvrir le rapport existant →
                </Link>
              </div>
            ) : null}

            {warnings.length > 0 ? (
              <div className="rounded-[var(--radius-md)] bg-accent/10 px-3 py-2 text-xs text-content-muted ring-1 ring-inset ring-accent/30">
                {warnings.join(" ")}
              </div>
            ) : null}

            {extractedCount > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(extractedFields).map(([field, meta]) => (
                  <span
                    key={field}
                    className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-content-muted ring-1 ring-inset ring-line"
                  >
                    {field === "image_url" ? "photo" : field} · {fieldSourceLabel(meta)}
                  </span>
                ))}
              </div>
            ) : null}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SwarmInputForm
            key={prefillKey}
            action={action}
            fields={fields}
            initialValues={prefill}
            extractedFields={extractedFields}
          />
        </CardBody>
      </Card>
    </div>
  );
}
