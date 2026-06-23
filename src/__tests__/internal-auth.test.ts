/**
 * Test — signer JWT interne BFF → Engine (src/lib/crewai/internal-auth.ts).
 *
 * Vérifie le contrat de signature (HS256, iss/aud/sub/owner_id/exp court),
 * le binding au secret, et les garde-fous (secret manquant, ownerId vide).
 * Aucun token n'est affiché ; on ne teste que les claims décodés.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { jwtVerify } from "jose";

// `server-only` jette hors d'un contexte RSC ; en test (node) on le neutralise.
// Le garde-fou reste actif dans le bundle réel (le mock n'existe qu'ici).
vi.mock("server-only", () => ({}));

const SECRET = "test-internal-jwt-secret-please-rotate-0123456789";
const OWNER = "11111111-1111-1111-1111-111111111111";
const ISSUER = "myswarms-bff";
const AUDIENCE = "crewai-engine";

async function loadModule(secret?: string) {
  vi.resetModules();
  if (secret === undefined) {
    delete process.env.CREWAI_ENGINE_JWT_SECRET;
  } else {
    process.env.CREWAI_ENGINE_JWT_SECRET = secret;
  }
  return import("@/lib/crewai/internal-auth");
}

describe("createEngineInternalToken", () => {
  afterEach(() => {
    process.env.CREWAI_ENGINE_JWT_SECRET = SECRET;
  });

  it("signe un HS256 vérifiable avec les claims attendus", async () => {
    const { createEngineInternalToken } = await loadModule(SECRET);
    const token = await createEngineInternalToken({ ownerId: OWNER });

    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(SECRET),
      { issuer: ISSUER, audience: AUDIENCE },
    );

    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.owner_id).toBe(OWNER);
    expect(payload.sub).toBe(OWNER);
    expect(payload.iss).toBe(ISSUER);
    expect(payload.aud).toBe(AUDIENCE);
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    // TTL court (≤ 5 min).
    expect((payload.exp as number) - (payload.iat as number)).toBeLessThanOrEqual(300);
  });

  it("inclut tenant_id quand fourni", async () => {
    const { createEngineInternalToken } = await loadModule(SECRET);
    const token = await createEngineInternalToken({ ownerId: OWNER, tenantId: "hive" });
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(SECRET),
      { issuer: ISSUER, audience: AUDIENCE },
    );
    expect(payload.tenant_id).toBe("hive");
  });

  it("la signature est liée au secret (un autre secret ne vérifie pas)", async () => {
    const { createEngineInternalToken } = await loadModule(SECRET);
    const token = await createEngineInternalToken({ ownerId: OWNER });
    await expect(
      jwtVerify(
        token,
        new TextEncoder().encode("a-totally-different-secret-000000000000"),
        { issuer: ISSUER, audience: AUDIENCE },
      ),
    ).rejects.toThrow();
  });

  it("lève une erreur si le secret n'est pas configuré", async () => {
    const { createEngineInternalToken } = await loadModule(undefined);
    await expect(createEngineInternalToken({ ownerId: OWNER })).rejects.toThrow(
      /JWT_SECRET/,
    );
  });

  it("lève une erreur si ownerId est vide", async () => {
    const { createEngineInternalToken } = await loadModule(SECRET);
    await expect(createEngineInternalToken({ ownerId: "" })).rejects.toThrow(
      /ownerId/,
    );
  });
});
