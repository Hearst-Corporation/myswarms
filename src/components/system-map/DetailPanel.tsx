"use client";

import Link from "next/link";
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
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: accent,
              flexShrink: 0,
            }}
          />
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--ct-text-strong)",
              margin: 0,
              lineHeight: 1.25,
            }}
          >
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau"
          style={{
            appearance: "none",
            background: "transparent",
            border: "none",
            color: "var(--ct-text-muted)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ✕
        </button>
      </div>

      <span
        style={{
          display: "inline-block",
          fontSize: 9,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ct-text-faint)",
          marginBottom: 12,
        }}
      >
        {KIND_LABEL[data.kind]}
      </span>

      <dl style={{ margin: 0 }}>
        {rows.map((r, i) => (
          <div
            key={`${r.label}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(72px, 38%) 1fr",
              gap: 8,
              padding: "5px 0",
              borderBottom: "1px solid var(--ct-border-soft)",
            }}
          >
            <dt
              style={{
                fontSize: 10,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ct-text-faint)",
              }}
            >
              {r.label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: 12,
                color: "var(--ct-text-primary)",
                wordBreak: "break-word",
                lineHeight: 1.4,
              }}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {body ? (
        <div style={{ marginTop: 12 }}>
          {d?.bodyLabel ? (
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ct-text-faint)",
                marginBottom: 4,
              }}
            >
              {d.bodyLabel}
            </div>
          ) : null}
          <p
            style={{
              fontSize: 12,
              color: "var(--ct-text-primary)",
              lineHeight: 1.5,
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {body}
          </p>
        </div>
      ) : null}

      {d?.links?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {d.links.map((l) => (
            <Link key={l.href} href={l.href} className="ct-seg-btn" style={{ fontSize: 11 }}>
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
