"use client";

import { useCallback, useMemo } from "react";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";
import { extractRecommendation } from "@/lib/swarms/recommendation";

// ── Markdown → HTML parser (pas de dépendance externe) ───────────────────────
//
// Couvre le sous-ensemble produit par les agents CrewAI :
//   # H1  ## H2  ### H3  **bold**  *italic*  - item  1. item  --- hr
//   `code`  lignes vides = paragraphe  > blockquote
//
// Entrée : texte LLM interne (pas d'input user) → dangerouslySetInnerHTML safe.

function markdownToHtml(md: string): string {
  // Escape HTML special chars to prevent injection from any stray < or &.
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Inline formatting applied inside block elements.
  const inline = (s: string): string =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");

  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      out.push(`<h${level}>${inline(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      i++;
      continue;
    }

    // Table — collect header + separator + rows
    if (/^\|/.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const [header, , ...rows] = tableLines; // skip separator line (index 1)
        const parseCells = (row: string) =>
          row.split("|").slice(1, -1).map((c) => inline(c.trim()));
        const thCells = parseCells(header);
        const thead = `<thead><tr>${thCells.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
        const tbody = rows
          .map((row) => {
            const cells = parseCells(row);
            return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
          })
          .join("");
        out.push(`<table class="md-table">${thead}<tbody>${tbody}</tbody></table>`);
      }
      continue;
    }

    // Unordered list — collect consecutive items
    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^[-*]\s/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Empty line → paragraph break (skip silently)
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular paragraph — collect until empty line or block element
    const pLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,3}|---+|[-*]\s|\d+\.\s|> )/.test(lines[i])
    ) {
      pLines.push(inline(lines[i]));
      i++;
    }
    if (pLines.length) {
      out.push(`<p>${pLines.join("<br />")}</p>`);
    }
  }

  return out.join("\n");
}

// ── Couleurs par recommandation ───────────────────────────────────────────────

const REC_COLORS: Record<string, string> = {
  APPELER: "var(--ct-state-ok)",
  ATTENDRE: "var(--ct-accent-strong)",
  ÉVITER: "var(--ct-alert-error-text)",
  UNKNOWN: "var(--ct-text-primary)",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface MarkdownReportProps {
  text: string;
  title?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MarkdownReport({ text, title }: MarkdownReportProps) {
  const html = useMemo(() => markdownToHtml(text), [text]);
  const rec = extractRecommendation(text);
  const hasRec = rec !== "UNKNOWN";
  const recColor = REC_COLORS[rec] ?? "var(--ct-text-primary)";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, [text]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title ?? "report"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [text, title]);

  return (
    <div>
      {/* Recommendation banner */}
      {hasRec && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: SPACING.md,
            padding: `${SPACING.md}px ${SPACING.lx}px`,
            background: "var(--ct-surface-2)",
            borderRadius: RADIUS.md,
            border: `1px solid var(--ct-border)`,
            marginBottom: SPACING.lg,
          }}
        >
          <span style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Recommendation
          </span>
          <span
            style={{
              fontSize: FONT.lg,
              fontWeight: FONT_WEIGHT.extrabold,
              color: recColor,
              letterSpacing: "0.04em",
            }}
          >
            {rec}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: SPACING.sm,
          justifyContent: "flex-end",
          marginBottom: SPACING.md,
        }}
      >
        <button
          type="button"
          className="ct-seg-btn"
          onClick={handleCopy}
          style={{ fontSize: FONT.sm }}
        >
          Copy
        </button>
        <button
          type="button"
          className="ct-seg-btn"
          onClick={handleDownload}
          style={{ fontSize: FONT.sm }}
        >
          ↓ .md
        </button>
      </div>

      {/* Rendered Markdown */}
      <div
        className="md-report"
        // Text comes from our own LLM backend — not user input.
        // HTML is escaped inside markdownToHtml before tag injection.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
