"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

type AlertDialogVariant = "destructive" | "warning" | "default";

export interface AlertDialogProps {
  open: boolean;
  onClose: () => void;
  /** Peut être async — busy géré automatiquement pendant l'attente. */
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  /** Contenu optionnel pour lister les impacts (tâches orphelines, etc.). */
  impact?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: AlertDialogVariant;
  /** Forçage externe de l'état busy (ex: action déjà en cours dans le parent). */
  busy?: boolean;
}

export function AlertDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  impact,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  busy: externalBusy = false,
}: AlertDialogProps) {
  const [internalBusy, setInternalBusy] = useState(false);
  const busy = externalBusy || internalBusy;

  // Auto-close après onConfirm ; le consommateur peut throw pour empêcher la fermeture.
  const handleConfirm = useCallback(async () => {
    if (internalBusy) return;
    setInternalBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Le consommateur peut throw pour empêcher la fermeture (ex: erreur réseau visible)
    } finally {
      setInternalBusy(false);
    }
  }, [onConfirm, onClose, internalBusy]);

  const confirmVariant = variant === "destructive" ? "danger" : "primary";

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? "Confirming…" : confirmLabel}
          </Button>
        </>
      }
    >
      {description ? (
        <p className="text-sm text-content-muted">{description}</p>
      ) : null}
      {impact ? (
        <div className="mt-3 rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm text-content-muted ring-1 ring-inset ring-line">
          {impact}
        </div>
      ) : null}
    </Modal>
  );
}
