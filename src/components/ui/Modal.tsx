"use client";

import {
  Dialog,
  DialogPanel,
  DialogTitle,
  DialogBackdrop,
} from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

/** Modal accessible (Headless UI) — DS MySwarms. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const width = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  }[size];

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[100]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className={cn(
            "w-full rounded-[var(--radius-xl)] bg-surface ring-1 ring-inset ring-line-strong shadow-2xl",
            "transition duration-150 data-closed:scale-95 data-closed:opacity-0",
            width,
            className,
          )}
        >
          {title ? (
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <DialogTitle className="text-sm font-semibold text-content-strong">
                {title}
              </DialogTitle>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="rounded-md p-1 text-content-muted hover:bg-surface-2 hover:text-content"
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>
          ) : null}
          <div className="p-5">{children}</div>
          {footer ? (
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
              {footer}
            </div>
          ) : null}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
