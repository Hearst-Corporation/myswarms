"use client";

import { useRef, useState, useTransition } from "react";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { BrandModelPicker } from "@/components/swarms/BrandModelPicker";
import type { InputField } from "@/lib/swarms/inputSchema";
import {
  Input,
  Textarea,
  Select,
  Label,
  Button,
  Alert,
} from "@/components/ui";
import { cn } from "@/lib/ui/cn";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SwarmInputFormState {
  error?: string;
}

type KickoffWithInputsAction = (
  prevState: SwarmInputFormState,
  formData: FormData,
) => Promise<SwarmInputFormState>;

interface Props {
  action: KickoffWithInputsAction;
  fields: InputField[];
  initialValues?: Record<string, string>;
  extractedFields?: Record<string, { source: string; confidence: string } | undefined>;
}

// ── Field component ───────────────────────────────────────────────────────────

function Field({
  field,
  error,
  initialValue = "",
  extractionMeta,
}: {
  field: InputField;
  error?: string;
  initialValue?: string;
  extractionMeta?: { source: string; confidence: string };
}) {
  const id = `swarm-input-${field.key}`;
  const errorRing = error
    ? "ring-[color-mix(in_oklab,var(--color-danger)_50%,transparent)]"
    : undefined;

  let control: React.ReactNode;
  if (field.type === "select" && field.options) {
    control = (
      <Select
        id={id}
        name={field.key}
        defaultValue={initialValue}
        className={errorRing}
      >
        <option value="" disabled>
          {field.placeholder || `Choisir…`}
        </option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    );
  } else if (field.type === "textarea") {
    control = (
      <Textarea
        id={id}
        name={field.key}
        placeholder={field.placeholder}
        defaultValue={initialValue}
        rows={3}
        className={errorRing}
      />
    );
  } else {
    control = (
      <Input
        id={id}
        name={field.key}
        type={field.type}
        placeholder={field.placeholder}
        defaultValue={initialValue}
        step={field.type === "number" ? "any" : undefined}
        className={errorRing}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="ml-0.5 text-accent-strong">*</span>}
      </Label>

      {control}

      {error ? (
        <span className="mt-1 text-xs text-danger">{error}</span>
      ) : extractionMeta ? (
        <span className="mt-1 text-xs text-accent-strong">
          Pré-rempli depuis {extractionMeta.source} · confiance{" "}
          {extractionMeta.confidence}
        </span>
      ) : field.description ? (
        <span className="mt-1 text-xs text-content-faint">
          {field.description.replace(/^[^—]*—\s*/, "")}
        </span>
      ) : null}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function SwarmInputForm({
  action,
  fields,
  initialValues = {},
  extractedFields = {},
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);

  const hasBrandModel =
    fields.some((f) => f.key === "make") && fields.some((f) => f.key === "model");

  // Client-side validation before confirmation dialog
  function validate(): boolean {
    const form = formRef.current;
    if (!form) return false;
    const data = new FormData(form);
    const errors: Record<string, string> = {};

    for (const field of fields) {
      const val = (data.get(field.key) as string | null)?.trim() ?? "";
      if (field.required && !val) {
        errors[field.key] = `${field.label} is required`;
      } else if (field.type === "number" && val && isNaN(Number(val))) {
        errors[field.key] = "Must be a number";
      } else if (field.type === "url" && val) {
        try {
          new URL(val);
        } catch {
          errors[field.key] = "Must be a valid URL (https://…)";
        }
      } else if (field.type === "select" && field.required && !val) {
        errors[field.key] = `${field.label} is required`;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleRunClick() {
    if (validate()) setConfirmOpen(true);
  }

  function handleConfirm() {
    setConfirmOpen(false);
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await action({}, formData);
      if (result.error) setActionError(result.error);
    });
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <form
        ref={formRef}
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-5"
      >
        {/* Hidden trigger field */}
        <input type="hidden" name="trigger" value="on_demand" />
        {initialValues.image_url ? (
          <input type="hidden" name="image_url" value={initialValues.image_url} />
        ) : null}

        {/* Field grid — auto-fill, 1 col on narrow */}
        <div
          className={cn(
            "grid gap-5",
            "[grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]",
          )}
        >
          {/* Si le form contient make + model (template automobile), on les
              remplace par le sélecteur Marque (avec logo) → Modèle dépendant. */}
          {hasBrandModel && (
            <BrandModelPicker
              defaultMake={initialValues.make ?? ""}
              defaultModel={initialValues.model ?? ""}
            />
          )}
          {fields
            .filter((f) => !(hasBrandModel && (f.key === "make" || f.key === "model")))
            .map((f) => (
              <Field
                key={f.key}
                field={f}
                error={fieldErrors[f.key]}
                initialValue={initialValues[f.key] ?? ""}
                extractionMeta={extractedFields[f.key]}
              />
            ))}
        </div>

        {/* Run button row */}
        <div className="flex justify-end gap-2">
          <Button
            variant="primary"
            disabled={isPending}
            onClick={handleRunClick}
          >
            {isPending ? "Running…" : "Run now"}
          </Button>
        </div>
      </form>

      <AlertDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title="Run this now?"
        description="This action consumes LLM tokens and is not reversible."
        confirmLabel="Run"
        cancelLabel="Cancel"
        variant="warning"
      />

      {actionError && (
        <Alert tone="error" role="alert">
          {actionError}
        </Alert>
      )}
    </div>
  );
}
