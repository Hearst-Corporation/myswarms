import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROJECT_ROOT,
  resolveSafePath,
  validateCommand,
  validateReadOnlySql,
} from "./scope";

export type ToolContext = {
  supabase: SupabaseClient;
  signal: AbortSignal;
};

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

const MAX_READ_BYTES = 64 * 1024;
const MAX_WRITE_BYTES = 256 * 1024;
const MAX_GREP_HITS = 80;
const MAX_LIST_ENTRIES = 200;
const MAX_CMD_BUFFER = 32 * 1024;
const DEFAULT_CMD_TIMEOUT_MS = 30_000;

export const TOOL_SCHEMAS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description:
        "Lit un fichier du projet (relatif à la racine). Bloque node_modules, .git, .env*.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin relatif (ex: src/app/page.tsx)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_dir",
      description: "Liste les enfants d'un dossier (relatif à la racine).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin relatif (ex: src/components)" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "grep",
      description:
        "Cherche un pattern regex (JS) dans les fichiers texte du projet (extensions courantes seulement).",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex JavaScript" },
          path: { type: "string", description: "Sous-dossier ou fichier (défaut: racine)" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description:
        "Écrit ou crée un fichier (relatif à la racine). Limite 256 KiB. Crée les dossiers parents au besoin.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin relatif" },
          content: { type: "string", description: "Contenu UTF-8" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_command",
      description:
        "Exécute une commande shell autorisée (npm/npx/git/tsc/eslint/vitest/node/pnpm/yarn). Pas de pipes/redirections.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Ex: npm run lint" },
          timeout_ms: { type: "number", description: "Défaut 30000, max 120000" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sql_query",
      description:
        "Exécute une requête SQL Supabase en lecture seule via la session utilisateur (RLS appliquée). SELECT/WITH/EXPLAIN uniquement.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Une seule requête, sans point-virgule final superflu" },
        },
        required: ["query"],
      },
    },
  },
];

const GREP_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".sql",
  ".css",
  ".scss",
  ".html",
  ".yml",
  ".yaml",
  ".toml",
  ".sh",
  ".py",
]);

async function readFileTool(args: { path: string }): Promise<ToolResult> {
  const scope = resolveSafePath(args.path);
  if (!scope.ok) return { ok: false, error: scope.reason };
  try {
    const stat = await fs.stat(scope.absolute);
    if (stat.isDirectory()) return { ok: false, error: "c'est un dossier, utilise list_dir" };
    if (stat.size > MAX_READ_BYTES) {
      const fd = await fs.open(scope.absolute, "r");
      try {
        const buf = Buffer.alloc(MAX_READ_BYTES);
        await fd.read(buf, 0, MAX_READ_BYTES, 0);
        return {
          ok: true,
          data: {
            path: args.path,
            size: stat.size,
            truncated: true,
            content: buf.toString("utf8"),
          },
        };
      } finally {
        await fd.close();
      }
    }
    const content = await fs.readFile(scope.absolute, "utf8");
    return { ok: true, data: { path: args.path, size: stat.size, truncated: false, content } };
  } catch (err) {
    return { ok: false, error: `read_file: ${(err as Error).message}` };
  }
}

async function listDirTool(args: { path: string }): Promise<ToolResult> {
  const scope = resolveSafePath(args.path);
  if (!scope.ok) return { ok: false, error: scope.reason };
  try {
    const entries = await fs.readdir(scope.absolute, { withFileTypes: true });
    const out = entries
      .filter((e) => !e.name.startsWith("."))
      .slice(0, MAX_LIST_ENTRIES)
      .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }));
    return {
      ok: true,
      data: { path: args.path, count: entries.length, truncated: entries.length > MAX_LIST_ENTRIES, entries: out },
    };
  } catch (err) {
    return { ok: false, error: `list_dir: ${(err as Error).message}` };
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === ".next") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (GREP_EXTS.has(path.extname(e.name))) {
      yield full;
    }
  }
}

async function grepTool(args: { pattern: string; path?: string }): Promise<ToolResult> {
  let re: RegExp;
  try {
    re = new RegExp(args.pattern, "m");
  } catch (err) {
    return { ok: false, error: `regex invalide: ${(err as Error).message}` };
  }
  const target = args.path ?? ".";
  const scope = resolveSafePath(target);
  if (!scope.ok) return { ok: false, error: scope.reason };
  const stat = await fs.stat(scope.absolute).catch(() => null);
  if (!stat) return { ok: false, error: "chemin introuvable" };

  const files: string[] = [];
  if (stat.isFile()) files.push(scope.absolute);
  else for await (const f of walk(scope.absolute)) files.push(f);

  const hits: Array<{ path: string; line: number; text: string }> = [];
  for (const file of files) {
    if (hits.length >= MAX_GREP_HITS) break;
    const content = await fs.readFile(file, "utf8").catch(() => null);
    if (content === null) continue;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        hits.push({
          path: path.relative(PROJECT_ROOT, file),
          line: i + 1,
          text: lines[i].slice(0, 240),
        });
        if (hits.length >= MAX_GREP_HITS) break;
      }
    }
  }
  return { ok: true, data: { pattern: args.pattern, files_scanned: files.length, hits } };
}

async function writeFileTool(args: { path: string; content: string }): Promise<ToolResult> {
  const scope = resolveSafePath(args.path);
  if (!scope.ok) return { ok: false, error: scope.reason };
  if (typeof args.content !== "string") return { ok: false, error: "content doit être une string" };
  if (Buffer.byteLength(args.content, "utf8") > MAX_WRITE_BYTES) {
    return { ok: false, error: `contenu > ${MAX_WRITE_BYTES} octets — découpe-le` };
  }
  try {
    await fs.mkdir(path.dirname(scope.absolute), { recursive: true });
    await fs.writeFile(scope.absolute, args.content, "utf8");
    return { ok: true, data: { path: args.path, bytes: Buffer.byteLength(args.content, "utf8") } };
  } catch (err) {
    return { ok: false, error: `write_file: ${(err as Error).message}` };
  }
}

async function runCommandTool(
  args: { command: string; timeout_ms?: number },
  ctx: ToolContext,
): Promise<ToolResult> {
  const check = validateCommand(args.command);
  if (!check.ok) return { ok: false, error: check.reason };
  const argv = check.argv!;
  const timeout = Math.min(Math.max(args.timeout_ms ?? DEFAULT_CMD_TIMEOUT_MS, 1_000), 120_000);
  return new Promise<ToolResult>((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: PROJECT_ROOT,
      env: { ...process.env, CI: "1", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const t = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeout);
    const onAbort = () => {
      killed = true;
      child.kill("SIGKILL");
    };
    ctx.signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d) => {
      if (stdout.length < MAX_CMD_BUFFER) stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < MAX_CMD_BUFFER) stderr += d.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(t);
      ctx.signal.removeEventListener("abort", onAbort);
      resolve({ ok: false, error: `spawn: ${err.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(t);
      ctx.signal.removeEventListener("abort", onAbort);
      resolve({
        ok: code === 0,
        data: {
          command: args.command,
          exit_code: code,
          killed,
          stdout: stdout.slice(0, MAX_CMD_BUFFER),
          stderr: stderr.slice(0, MAX_CMD_BUFFER),
        },
        error: code === 0 ? undefined : `exit ${code}${killed ? " (killed/timeout)" : ""}`,
      });
    });
  });
}

async function sqlQueryTool(args: { query: string }, ctx: ToolContext): Promise<ToolResult> {
  const check = validateReadOnlySql(args.query);
  if (!check.ok) return { ok: false, error: check.reason };
  // Pas d'API SQL brute via supabase-js : on passe par la RPC `exec_readonly_sql`
  // si elle existe, sinon on indique au modèle d'utiliser des sélecteurs `.from(...)`.
  // On tente la RPC ; si elle est absente, on remonte une erreur claire.
  const { data, error } = await ctx.supabase.rpc("exec_readonly_sql", { q: check.absolute });
  if (error) {
    return {
      ok: false,
      error: `sql_query: ${error.message}. (Astuce: si exec_readonly_sql n'existe pas, dis-le à l'utilisateur et utilise plutôt les routes API du projet.)`,
    };
  }
  return { ok: true, data: { rows: data } };
}

export async function dispatchTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch (err) {
    return { ok: false, error: `args JSON invalides: ${(err as Error).message}` };
  }
  switch (name) {
    case "read_file":
      return readFileTool(args as { path: string });
    case "list_dir":
      return listDirTool(args as { path: string });
    case "grep":
      return grepTool(args as { pattern: string; path?: string });
    case "write_file":
      return writeFileTool(args as { path: string; content: string });
    case "run_command":
      return runCommandTool(args as { command: string; timeout_ms?: number }, ctx);
    case "sql_query":
      return sqlQueryTool(args as { query: string }, ctx);
    default:
      return { ok: false, error: `tool inconnu: ${name}` };
  }
}

export function summarizeToolCall(name: string, rawArgs: string): string {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return `${name}(…)`;
  }
  switch (name) {
    case "read_file":
    case "list_dir":
    case "write_file":
      return `${name}(${String(args.path ?? "")})`;
    case "grep":
      return `grep(${JSON.stringify(args.pattern ?? "")}${args.path ? `, ${String(args.path)}` : ""})`;
    case "run_command":
      return `run(${String(args.command ?? "")})`;
    case "sql_query": {
      const q = String(args.query ?? "");
      return `sql(${q.length > 60 ? q.slice(0, 57) + "..." : q})`;
    }
    default:
      return `${name}(…)`;
  }
}
