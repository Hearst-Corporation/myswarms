"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { Select, Button, Alert } from "@/components/ui";
import { AlertDialog } from "@/components/ui/AlertDialog";

export interface KickoffFormState {
  error?: string;
}

type KickoffAction = (
  prevState: KickoffFormState,
  formData: FormData,
) => Promise<KickoffFormState>;

export function KickoffForm({ action }: { action: KickoffAction }) {
  // isPending : 3e élément du tuple useActionState (React 19) — true pendant l'action serveur
  const [state, formAction, isPending] = useActionState<KickoffFormState, FormData>(action, {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleConfirm = () => {
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  };

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex items-center gap-2">
        <form ref={formRef} action={formAction} className="flex items-center gap-2">
          <Select name="trigger" defaultValue="on_demand" aria-label="Trigger" className="h-9 w-40">
            <option value="on_demand">On-demand</option>
            <option value="morning">Morning</option>
            <option value="evening">Evening</option>
            <option value="intraday">Intraday</option>
          </Select>
          {/* Submit invisible — déclenché par requestSubmit() depuis onConfirm */}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>

        {/* Bouton visible — ouvre la dialog, pas un submit direct */}
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {isPending ? "Running…" : "Run now"}
        </Button>
      </div>

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

      {state.error ? (
        <Alert tone="error" role="alert">
          {state.error}
        </Alert>
      ) : null}
    </div>
  );
}
