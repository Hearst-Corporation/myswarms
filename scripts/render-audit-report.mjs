#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const data = JSON.parse(fs.readFileSync(args.data, "utf8"));
const outDir = path.resolve("docs/audit");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `audit-${data.date}.html`);

const severityColor = { P0: "#ef4444", P1: "#f59e0b", P2: "#60a5fa" };
const axeLabel = {
  interface: "Interface",
  experience: "Expérience",
  securite: "Sécurité",
  performance: "Performance",
  code: "Code",
  dependances: "Dépendances",
};

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const renderFinding = (f) => `
  <div class="finding sev-${f.severity}">
    <div class="finding-head">
      <span class="badge" style="background:${severityColor[f.severity]}">${f.severity}</span>
      <span class="rule">${escapeHtml(f.rule)}</span>
      <span class="path">${escapeHtml(f.path || f.package || "")}${f.line ? `:${f.line}` : ""}</span>
    </div>
    <div class="title">${escapeHtml(f.title)}</div>
    ${f.current ? `<div class="row"><span class="lbl">Actuel</span><code>${escapeHtml(f.current)}</code></div>` : ""}
    ${f.suggested ? `<div class="row"><span class="lbl">Suggéré</span><code>${escapeHtml(f.suggested)}</code></div>` : ""}
    ${f.why ? `<div class="row why">${escapeHtml(f.why)}</div>` : ""}
  </div>
`;

const renderSection = (s) => `
  <section class="axe-section">
    <header class="axe-head">
      <h2>${axeLabel[s.axe] || s.axe}</h2>
      <div class="kpis">
        <span class="kpi kpi-p0">P0 · ${s.kpis.p0}</span>
        <span class="kpi kpi-p1">P1 · ${s.kpis.p1}</span>
        <span class="kpi kpi-p2">P2 · ${s.kpis.p2}</span>
        <span class="kpi kpi-score">Score · ${s.score}/10</span>
      </div>
    </header>
    ${s.top_issues?.length ? `<ul class="top-issues">${s.top_issues.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""}
    <div class="findings">
      ${s.findings.map(renderFinding).join("")}
    </div>
  </section>
`;

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(data.title)} — ${data.date}</title>
<style>
  :root {
    --bg-deep: #0f0708;
    --bg-1: #1a1011;
    --bg-2: #221517;
    --surface: rgba(255,255,255,0.04);
    --surface-2: rgba(255,255,255,0.07);
    --border: rgba(255,255,255,0.08);
    --text: #f5e9ec;
    --text-dim: #b8a4a8;
    --burgundy: #6b1e2e;
    --burgundy-2: #8a2638;
    --p0: #ef4444;
    --p1: #f59e0b;
    --p2: #60a5fa;
    --ok: #22c55e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: linear-gradient(180deg, var(--bg-deep), var(--bg-1));
    color: var(--text);
    line-height: 1.5;
    min-height: 100vh;
  }
  .container { max-width: 1100px; margin: 0 auto; padding: 32px 24px 80px; }
  header.hero {
    padding: 32px;
    background: linear-gradient(135deg, var(--burgundy), var(--burgundy-2));
    border-radius: 16px;
    margin-bottom: 32px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  header.hero h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.02em; }
  header.hero .meta { opacity: 0.8; font-size: 14px; }
  .global-kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin: 24px 0 32px;
  }
  .global-kpi {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
  }
  .global-kpi .value { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; }
  .global-kpi .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin-top: 6px; }
  .global-kpi.p0 .value { color: var(--p0); }
  .global-kpi.p1 .value { color: var(--p1); }
  .global-kpi.p2 .value { color: var(--p2); }
  .global-kpi.score .value { color: var(--ok); }
  .axe-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 20px;
    backdrop-filter: blur(8px);
  }
  .axe-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .axe-head h2 { margin: 0; font-size: 20px; letter-spacing: -0.01em; }
  .kpis { display: flex; gap: 8px; flex-wrap: wrap; }
  .kpi {
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid var(--border);
    background: var(--surface-2);
  }
  .kpi-p0 { color: var(--p0); border-color: var(--p0); }
  .kpi-p1 { color: var(--p1); border-color: var(--p1); }
  .kpi-p2 { color: var(--p2); border-color: var(--p2); }
  .kpi-score { color: var(--ok); border-color: var(--ok); }
  .top-issues {
    margin: 8px 0 20px;
    padding-left: 20px;
    color: var(--text-dim);
    font-size: 14px;
  }
  .top-issues li { margin: 4px 0; }
  .findings { display: grid; gap: 10px; }
  .finding {
    background: var(--bg-2);
    border-left: 3px solid;
    border-radius: 6px;
    padding: 12px 14px;
  }
  .finding.sev-P0 { border-left-color: var(--p0); }
  .finding.sev-P1 { border-left-color: var(--p1); }
  .finding.sev-P2 { border-left-color: var(--p2); }
  .finding-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; margin-bottom: 6px; }
  .badge { padding: 2px 8px; border-radius: 4px; color: #000; font-weight: 700; font-size: 11px; }
  .rule { color: var(--text-dim); font-family: ui-monospace, "SF Mono", monospace; }
  .path { color: var(--text-dim); margin-left: auto; font-family: ui-monospace, "SF Mono", monospace; font-size: 11px; }
  .title { font-weight: 500; margin-bottom: 6px; }
  .row { display: flex; gap: 8px; align-items: flex-start; margin: 4px 0; font-size: 13px; }
  .lbl { color: var(--text-dim); min-width: 60px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; padding-top: 2px; }
  code { background: var(--surface-2); padding: 2px 6px; border-radius: 4px; font-size: 12px; word-break: break-word; flex: 1; }
  .row.why { color: var(--text-dim); font-size: 12px; padding-left: 68px; font-style: italic; }
  footer { margin-top: 40px; text-align: center; color: var(--text-dim); font-size: 12px; }
</style>
</head>
<body>
  <div class="container">
    <header class="hero">
      <h1>${escapeHtml(data.title)}</h1>
      <div class="meta">${data.date} · 6 axes · ${data.sections.reduce((n, s) => n + s.findings.length, 0)} findings</div>
    </header>

    <div class="global-kpis">
      <div class="global-kpi p0"><div class="value">${data.kpis.p0}</div><div class="label">P0 critiques</div></div>
      <div class="global-kpi p1"><div class="value">${data.kpis.p1}</div><div class="label">P1 cohérence</div></div>
      <div class="global-kpi p2"><div class="value">${data.kpis.p2}</div><div class="label">P2 dettes</div></div>
      <div class="global-kpi score"><div class="value">${data.kpis.score}/10</div><div class="label">Score moyen</div></div>
    </div>

    ${data.sections.map(renderSection).join("")}

    <footer>Généré par /audit-adrien · MySwarms · ${data.date}</footer>
  </div>
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log(`✓ Rapport généré: ${outPath}`);

if (args.open) {
  const { execSync } = await import("node:child_process");
  try {
    execSync(`open "${outPath}"`);
  } catch {}
}
