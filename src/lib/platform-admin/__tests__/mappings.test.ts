/**
 * Tests for src/lib/platform-admin/mappings.ts
 *
 * Vérifie le presence-only des mappings externes et la dérivation des statuts
 * d'outils (enabled / fail_closed / not_configured) — jamais de valeur brute.
 */
import { describe, it, expect } from "vitest";
import {
  readMappingSnapshot,
  tenantMappingsFor,
  tenantToolPermissionsFor,
} from "../mappings";

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const OWNER_B = "22222222-2222-2222-2222-222222222222";

function envWith(over: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return over as NodeJS.ProcessEnv;
}

describe("readMappingSnapshot", () => {
  it("parses owner JSON maps into presence sets", () => {
    const snap = readMappingSnapshot(
      envWith({
        COMPOSIO_ENTITY_BY_OWNER_JSON: JSON.stringify({ [OWNER_A]: "entity-x" }),
        TELEGRAM_CHAT_BY_OWNER_JSON: JSON.stringify({ [OWNER_A]: "12345" }),
        VAULT_NAMESPACE_BY_OWNER_JSON: JSON.stringify({ [OWNER_B]: "ns-b" }),
        CHIEF_SCHEDULER_OWNER_ID: OWNER_A,
        COMPOSIO_API_KEY: "ak_secret",
      }),
    );
    expect(snap.composioOwners.has(OWNER_A)).toBe(true);
    expect(snap.composioOwners.has(OWNER_B)).toBe(false);
    expect(snap.vaultOwners.has(OWNER_B)).toBe(true);
    expect(snap.schedulerOwnerId).toBe(OWNER_A);
    expect(snap.composioConfigured).toBe(true);
  });

  it("treats empty/invalid JSON as no mappings (fail-closed)", () => {
    const snap = readMappingSnapshot(
      envWith({ COMPOSIO_ENTITY_BY_OWNER_JSON: "not-json", TELEGRAM_CHAT_BY_OWNER_JSON: "" }),
    );
    expect(snap.composioOwners.size).toBe(0);
    expect(snap.telegramOwners.size).toBe(0);
  });

  it("ignores empty mapping values", () => {
    const snap = readMappingSnapshot(
      envWith({ COMPOSIO_ENTITY_BY_OWNER_JSON: JSON.stringify({ [OWNER_A]: "", [OWNER_B]: "x" }) }),
    );
    expect(snap.composioOwners.has(OWNER_A)).toBe(false);
    expect(snap.composioOwners.has(OWNER_B)).toBe(true);
  });
});

describe("tenantMappingsFor", () => {
  it("returns present/absent only — never the value", () => {
    const snap = readMappingSnapshot(
      envWith({
        COMPOSIO_ENTITY_BY_OWNER_JSON: JSON.stringify({ [OWNER_A]: "secret-entity" }),
        CHIEF_SCHEDULER_OWNER_ID: OWNER_A,
      }),
    );
    const m = tenantMappingsFor(OWNER_A, snap);
    expect(m.composioEntity).toBe("present");
    expect(m.telegramChat).toBe("absent");
    expect(m.schedulerOwner).toBe("present");
    // Aucune valeur ne doit fuiter dans l'objet sérialisé.
    expect(JSON.stringify(m)).not.toContain("secret-entity");
  });
});

describe("tenantToolPermissionsFor", () => {
  it("enabled when owner mapped, fail_closed when global-configured but unmapped", () => {
    const snap = readMappingSnapshot(
      envWith({
        COMPOSIO_ENTITY_BY_OWNER_JSON: JSON.stringify({ [OWNER_A]: "e" }),
        COMPOSIO_API_KEY: "ak_x",
        TELEGRAM_BOT_TOKEN: "123:abc",
      }),
    );
    const a = tenantToolPermissionsFor(OWNER_A, snap);
    expect(a.composio).toBe("enabled");
    // telegram global configuré mais owner non mappé -> fail_closed
    expect(a.telegram).toBe("fail_closed");

    const b = tenantToolPermissionsFor(OWNER_B, snap);
    expect(b.composio).toBe("fail_closed");
  });

  it("not_configured when neither mapping nor global config", () => {
    const snap = readMappingSnapshot(envWith({}));
    const a = tenantToolPermissionsFor(OWNER_A, snap);
    expect(a.composio).toBe("not_configured");
    expect(a.telegram).toBe("not_configured");
    expect(a.vault).toBe("not_configured");
  });

  it("chief enabled only for the scheduler owner", () => {
    const snap = readMappingSnapshot(envWith({ CHIEF_SCHEDULER_OWNER_ID: OWNER_A }));
    expect(tenantToolPermissionsFor(OWNER_A, snap).chief).toBe("enabled");
    expect(tenantToolPermissionsFor(OWNER_B, snap).chief).toBe("disabled");
  });

  it("architect is a platform capability (always enabled)", () => {
    const snap = readMappingSnapshot(envWith({}));
    expect(tenantToolPermissionsFor(OWNER_A, snap).architect).toBe("enabled");
  });
});
