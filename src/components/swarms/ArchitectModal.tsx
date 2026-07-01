"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArchitectGenerateRequestSchema,
  type ArchitectResponse,
  type SwarmInput,
} from "@/lib/forms/swarmSchemas";
import {
  Modal,
  Button,
  Field,
  Textarea,
  Alert,
  Spinner,
  SectionLabel,
} from "@/components/ui";

// Pas de magic numbers : bornes prompt dérivées du même schema Zod que le BFF.
const PROMPT_MIN = ArchitectGenerateRequestSchema.shape.prompt.minLength ?? 10;
const PROMPT_MAX = ArchitectGenerateRequestSchema.shape.prompt.maxLength ?? 4000;

type Phase = "idle" | "loading" | "error" | "success";

interface ArchitectModalProps {
  open: boolean;
  onClose: () => void;
  /** Appelé avec la spec générée (shape SwarmInputRaw) avant fermeture. */
  onGenerated: (spec: SwarmInput) => void;
}

export function ArchitectModal({
  open,
  onClose,
  onGenerated,
}: ArchitectModalProps) {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ArchitectResponse | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const promptValid =
    prompt.trim().length >= PROMPT_MIN && prompt.length <= PROMPT_MAX;
  const pending = phase === "loading";

  // Focus initial sur le textarea à l'ouverture. Le reset d'état est assuré
  // par un remount (clé `open-…` côté SwarmBuilder).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const generate = useCallback(async () => {
    if (!promptValid || pending) return;
    setPhase("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/swarms/architect/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? `Generation failed (${res.status})`);
      }
      const data = (await res.json()) as ArchitectResponse;
      setResult(data);
      setPhase("success");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Unknown architect error",
      );
      setPhase("error");
    }
  }, [prompt, promptValid, pending]);

  // En succès : injecte la spec dans le builder puis ferme.
  const applyResult = useCallback(() => {
    if (!result) return;
    onGenerated(result.spec);
    onClose();
  }, [result, onGenerated, onClose]);

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Generate a swarm with AI"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          {phase === "success" ? (
            <Button variant="primary" onClick={applyResult}>
              Inject into builder
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={generate}
              disabled={!promptValid || pending}
            >
              {pending
                ? "Generating…"
                : phase === "error"
                  ? "Retry"
                  : "Generate"}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <SectionLabel text="Architect Agent" />
          <p className="text-sm text-content-muted">
            Describe what your swarm should do. The architect suggests an agent
            and task composition you can edit before creating the swarm.
          </p>
        </div>

        {(phase === "idle" || phase === "error") && (
          <>
            <Field
              label="Natural language description"
              htmlFor="architect-modal-textarea"
              hint={`${prompt.trim().length}/${PROMPT_MAX} — minimum ${PROMPT_MIN} characters`}
            >
              <Textarea
                id="architect-modal-textarea"
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                maxLength={PROMPT_MAX}
                disabled={pending}
                placeholder="e.g. read my unread emails, sort them by priority, draft a daily summary and schedule urgent actions in my calendar"
              />
            </Field>

            {phase === "error" && errorMsg ? (
              <Alert tone="error" role="alert">
                {errorMsg}
              </Alert>
            ) : null}
          </>
        )}

        {phase === "loading" && (
          <div
            className="flex items-center gap-3 py-6 text-sm text-content"
            aria-live="polite"
          >
            <Spinner />
            <span>The architect is designing your swarm…</span>
          </div>
        )}

        {phase === "success" && result && (
          <div
            className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-surface-2 p-4 ring-1 ring-inset ring-line"
            aria-live="polite"
          >
            <SectionLabel text="Generated spec" />
            <p className="text-sm text-content">
              <strong className="text-content-strong">
                {result.spec.name || "Unnamed swarm"}
              </strong>{" "}
              — {result.spec.agents?.length ?? 0} agent(s),{" "}
              {result.spec.tasks?.length ?? 0} task(s).
            </p>
            {result.rationale ? (
              <p className="text-sm text-content-muted">{result.rationale}</p>
            ) : null}
            {result.warnings.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm text-warn">
                {result.warnings.map((w, i) => (
                  <li key={i}>⚠ {w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
  );
}
