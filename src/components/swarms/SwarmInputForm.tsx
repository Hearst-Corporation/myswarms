"use client";

import { useRef, useState, useTransition } from "react";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";
import { AlertDialog } from "@/components/ui/AlertDialog";
import type { InputField } from "@/lib/swarms/inputSchema";

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
}

// ── Styles communs ────────────────────────────────────────────────────────────

const inputBase: React.CSSProperties = {
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

const fieldWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const hintStyle: React.CSSProperties = {
  fontSize: FONT.xs,
  color: "var(--ct-text-faint)",
  marginTop: SPACING.xs,
};

// ── Field component ───────────────────────────────────────────────────────────

function Field({ field, error }: { field: InputField; error?: string }) {
  const id = `swarm-input-${field.key}`;
  const borderColor = error ? "var(--ct-alert-error-border)" : undefined;

  let control: React.ReactNode;
  if (field.type === "select" && field.options) {
    control = (
      <select
        id={id}
        name={field.key}
        defaultValue=""
        style={{ ...inputBase, borderColor, appearance: "none", cursor: "pointer" }}
      >
        <option value="" disabled>
          {field.placeholder || `Choisir…`}
        </option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "textarea") {
    control = (
      <textarea
        id={id}
        name={field.key}
        placeholder={field.placeholder}
        rows={3}
        style={{ ...inputBase, resize: "vertical", borderColor }}
      />
    );
  } else {
    control = (
      <input
        id={id}
        name={field.key}
        type={field.type}
        placeholder={field.placeholder}
        step={field.type === "number" ? "any" : undefined}
        style={{ ...inputBase, borderColor }}
      />
    );
  }

  return (
    <div style={fieldWrapStyle}>
      <label htmlFor={id} style={labelStyle}>
        {field.label}
        {field.required && (
          <span style={{ color: "var(--ct-accent-strong)", marginLeft: SPACING.hair }}>*</span>
        )}
      </label>

      {control}

      {error ? (
        <span style={{ ...hintStyle, color: "var(--ct-alert-error-text)" }}>
          {error}
        </span>
      ) : field.description ? (
        <span style={hintStyle}>{field.description.replace(/^[^—]*—\s*/, "")}</span>
      ) : null}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function SwarmInputForm({ action, fields }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);

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
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xl, width: "100%" }}>
      <form
        ref={formRef}
        onSubmit={(e) => e.preventDefault()}
        style={{ display: "flex", flexDirection: "column", gap: SPACING.lg }}
      >
        {/* Hidden trigger field */}
        <input type="hidden" name="trigger" value="on_demand" />

        {/* Field grid — 2 cols on wide, 1 on narrow */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: SPACING.lg,
          }}
        >
          {fields.map((f) => (
            <Field key={f.key} field={f} error={fieldErrors[f.key]} />
          ))}
        </div>

        {/* Run button row */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: SPACING.sm }}>
          <button
            type="button"
            className="ct-seg-btn primary"
            disabled={isPending}
            onClick={handleRunClick}
          >
            {isPending ? "Running…" : "Run now"}
          </button>
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
        <p
          role="alert"
          style={{
            borderRadius: RADIUS.md,
            border: "1px solid var(--ct-alert-error-border)",
            background: "var(--ct-alert-error-bg)",
            padding: `${SPACING.sm}px ${SPACING.md}px`,
            fontSize: FONT.xs,
            color: "var(--ct-alert-error-text)",
          }}
        >
          {actionError}
        </p>
      )}
    </div>
  );
}
