"use client";

import { useCallback, useMemo } from "react";
import { extractRecommendation } from "@/lib/swarms/recommendation";
import { Button } from "@/components/ui";

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

// ── Couleurs par recommandation (utilities du DS) ─────────────────────────────

const REC_COLOR_CLASS: Record<string, string> = {
  APPELER: "text-ok",
  ATTENDRE: "text-accent-strong",
  ÉVITER: "text-danger",
  UNKNOWN: "text-content-strong",
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
  const recColorClass = REC_COLOR_CLASS[rec] ?? "text-content-strong";

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
        <div className="mb-5 flex items-center gap-3 rounded-[var(--radius-md)] bg-surface-2 px-5 py-3 ring-1 ring-inset ring-line">
          <span className="text-xs uppercase tracking-wider text-content-muted">
            Recommendation
          </span>
          <span
            className={
              "text-lg font-extrabold tracking-wide " + recColorClass
            }
          >
            {rec}
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="mb-3 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={handleCopy}>
          Copy
        </Button>
        <Button variant="secondary" size="sm" onClick={handleDownload}>
          ↓ .md
        </Button>
      </div>

      {/* Rendered Markdown */}
      <div
        className="md-report text-sm leading-relaxed text-content [&_a]:text-accent [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-content-strong [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-content-strong [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-content-strong [&_hr]:my-4 [&_hr]:border-line [&_li]:ml-5 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:my-2 [&_strong]:text-content-strong [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-1.5 [&_th]:border [&_th]:border-line [&_th]:bg-surface-2 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_ul]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-content-muted"
        // Text comes from our own LLM backend — not user input.
        // HTML is escaped inside markdownToHtml before tag injection.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
