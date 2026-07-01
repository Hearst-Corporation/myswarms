"use client";

import Link from "next/link";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui";
import type { MapNodeData } from "./types";
import { KIND_LABEL, nodeColor } from "./MapNode";

export function DetailPanel({
  data,
  onClose,
}: {
  data: MapNodeData;
  onClose: () => void;
}) {
  const accent = nodeColor(data);
  const d = data.detail;
  const title = d?.title ?? data.label;
  const rows =
    d?.rows ??
    [
      { label: "Type", value: KIND_LABEL[data.kind] },
      ...(data.sub ? [{ label: "Détail", value: data.sub }] : []),
    ];
  const body = d?.body ?? data.desc;

  return (
    <aside className="sm-panel" aria-label={`Détail : ${title}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: accent }}
          />
          <h2 className="m-0 text-sm font-bold leading-snug text-content-strong">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau"
          className="rounded-md p-1 text-content-muted hover:bg-surface-3 hover:text-content"
        >
          <XMarkIcon className="size-4" />
        </button>
      </div>

      <span className="mb-3 inline-block text-[10px] uppercase tracking-wider text-content-faint">
        {KIND_LABEL[data.kind]}
      </span>

      <dl className="m-0">
        {rows.map((r, i) => (
          <div
            key={`${r.label}-${i}`}
            className="grid grid-cols-[minmax(88px,38%)_1fr] gap-2 border-b border-line py-1.5"
          >
            <dt className="text-xs uppercase tracking-tight text-content-faint">
              {r.label}
            </dt>
            <dd className="m-0 break-words text-sm leading-relaxed text-content">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {body ? (
        <div className="mt-3">
          {d?.bodyLabel ? (
            <div className="mb-1 text-[10px] uppercase tracking-wider text-content-faint">
              {d.bodyLabel}
            </div>
          ) : null}
          <p className="m-0 whitespace-pre-wrap text-sm leading-snug text-content">
            {body}
          </p>
        </div>
      ) : null}

      {d?.links?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {d.links.map((l) => (
            <Link key={l.href} href={l.href}>
              <Button variant="secondary" size="sm">{l.label}</Button>
            </Link>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
