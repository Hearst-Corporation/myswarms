import path from "node:path";

export const PROJECT_ROOT = process.cwd();

const BLOCKED_SEGMENTS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "dist-electron",
  "coverage",
]);

const BLOCKED_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
]);

export type ScopeCheck = { ok: true; absolute: string } | { ok: false; reason: string };

export function resolveSafePath(input: string, { mustExist = false } = {}): ScopeCheck {
  if (!input || typeof input !== "string") {
    return { ok: false, reason: "chemin vide" };
  }
  const cleaned = input.trim();
  if (cleaned.startsWith("~") || path.isAbsolute(cleaned)) {
    return { ok: false, reason: "chemin absolu interdit — utilise un chemin relatif à la racine du projet" };
  }
  const abs = path.resolve(PROJECT_ROOT, cleaned);
  const rel = path.relative(PROJECT_ROOT, abs);
  if (rel.startsWith("..")) {
    return { ok: false, reason: "chemin hors racine projet" };
  }
  const segments = rel.split(path.sep);
  for (const seg of segments) {
    if (BLOCKED_SEGMENTS.has(seg)) {
      return { ok: false, reason: `dossier interdit: ${seg}` };
    }
  }
  const base = path.basename(rel);
  if (BLOCKED_FILES.has(base)) {
    return { ok: false, reason: `fichier interdit: ${base}` };
  }
  if (mustExist) {
    // caller will fs.stat — on garde scope.ts sans I/O
  }
  return { ok: true, absolute: abs };
}

const ALLOWED_COMMANDS = new Set([
  "npm",
  "npx",
  "git",
  "tsc",
  "eslint",
  "vitest",
  "node",
  "pnpm",
  "yarn",
]);

const BLOCKED_TOKENS = [
  "rm",
  "sudo",
  "curl",
  "wget",
  "scp",
  "ssh",
  "chmod",
  "chown",
  "dd",
  "mkfs",
  ">", // pas de redirection (évite "git status > /etc/passwd")
  ">>",
  "|",
  "&&",
  "||",
  ";",
  "`",
  "$(",
];

const BLOCKED_GIT_SUBCOMMANDS = new Set([
  "push",
  "reset",
  "clean",
  "checkout", // peut détruire des modifs locales
  "rebase",
  "merge",
  "rm",
  "config",
]);

export function validateCommand(raw: string): ScopeCheck & { argv?: string[] } {
  if (!raw || typeof raw !== "string") return { ok: false, reason: "commande vide" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "commande vide" };
  for (const tok of BLOCKED_TOKENS) {
    if (trimmed.includes(tok)) return { ok: false, reason: `token interdit: ${tok}` };
  }
  const argv = trimmed.split(/\s+/);
  const bin = argv[0];
  if (!ALLOWED_COMMANDS.has(bin)) {
    return { ok: false, reason: `binaire non autorisé: ${bin} (allowlist: ${[...ALLOWED_COMMANDS].join(", ")})` };
  }
  if (bin === "git" && argv[1] && BLOCKED_GIT_SUBCOMMANDS.has(argv[1])) {
    return { ok: false, reason: `git ${argv[1]} interdit depuis le chat` };
  }
  return { ok: true, absolute: bin, argv };
}

const READONLY_SQL_PREFIX = /^\s*(select|with|explain)\b/i;

export function validateReadOnlySql(query: string): ScopeCheck {
  if (!query || typeof query !== "string") return { ok: false, reason: "query vide" };
  const q = query.trim();
  if (!q) return { ok: false, reason: "query vide" };
  if (!READONLY_SQL_PREFIX.test(q)) {
    return { ok: false, reason: "seuls SELECT / WITH / EXPLAIN sont autorisés (écriture passe par les routes API)" };
  }
  if (/;\s*\S/.test(q)) {
    return { ok: false, reason: "une seule requête à la fois" };
  }
  return { ok: true, absolute: q };
}
