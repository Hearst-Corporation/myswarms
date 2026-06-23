"use client";

import Link from "next/link";
import { SPACING, FONT, FONT_WEIGHT, LINE_HEIGHT, LETTER_SPACING, SIZE } from "@/lib/ui/tokens";
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
          gap: SPACING.sm,
          marginBottom: SPACING.s,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm, minWidth: 0 }}>
          <span
            style={{
              width: SIZE.dot,
              height: SIZE.dot,
              borderRadius: "50%",
              background: accent,
              flexShrink: 0,
            }}
          />
          <h2
            style={{
              fontSize: FONT.md,
              fontWeight: FONT_WEIGHT.bold,
              color: "var(--ct-text-strong)",
              margin: 0,
              lineHeight: LINE_HEIGHT.snug,
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
            fontSize: FONT.lg,
            lineHeight: LINE_HEIGHT.none,
            padding: SPACING.hair,
          }}
        >
          ✕
        </button>
      </div>

      <span
        style={{
          display: "inline-block",
          fontSize: FONT.nano,
          letterSpacing: LETTER_SPACING.mid,
          textTransform: "uppercase",
          color: "var(--ct-text-faint)",
          marginBottom: SPACING.md,
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
              gridTemplateColumns: `minmax(${SIZE.detailLabelCol}px, 38%) 1fr`,
              gap: SPACING.sm,
              padding: `${SPACING.xs}px 0`,
              borderBottom: "1px solid var(--ct-border-soft)",
            }}
          >
            <dt
              style={{
                fontSize: FONT.xs,
                letterSpacing: LETTER_SPACING.tight,
                textTransform: "uppercase",
                color: "var(--ct-text-faint)",
              }}
            >
              {r.label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: FONT.sm,
                color: "var(--ct-text-primary)",
                wordBreak: "break-word",
                lineHeight: LINE_HEIGHT.relaxed,
              }}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {body ? (
        <div style={{ marginTop: SPACING.md }}>
          {d?.bodyLabel ? (
            <div
              style={{
                fontSize: FONT.nano,
                letterSpacing: LETTER_SPACING.mid,
                textTransform: "uppercase",
                color: "var(--ct-text-faint)",
                marginBottom: SPACING.xs,
              }}
            >
              {d.bodyLabel}
            </div>
          ) : null}
          <p
            style={{
              fontSize: FONT.sm,
              color: "var(--ct-text-primary)",
              lineHeight: LINE_HEIGHT.tight,
              margin: 0,
              whiteSpace: "pre-wrap",
            }}
          >
            {body}
          </p>
        </div>
      ) : null}

      {d?.links?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING.sm, marginTop: SPACING.lg }}>
          {d.links.map((l) => (
            <Link key={l.href} href={l.href} className="ct-seg-btn" style={{ fontSize: FONT.xxs }}>
              {l.label}
            </Link>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
