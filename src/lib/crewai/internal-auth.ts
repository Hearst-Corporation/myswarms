import { SignJWT } from "jose";
import "server-only";

/**
 * Secret utilisé pour signer les JWT internes BFF -> Engine.
 * Ne doit jamais être exposé côté client.
 */
const INTERNAL_JWT_SECRET = process.env.CREWAI_ENGINE_JWT_SECRET;

/**
 * Durée de vie du token interne (en secondes).
 * Court-vivant par design (5 minutes).
 */
const TOKEN_TTL_SECONDS = 300;

/**
 * Signe un JWT interne pour prouver l'identité de l'owner auprès de l'engine.
 *
 * @param ownerId - L'ID de l'utilisateur (sub/owner_id).
 * @param tenantId - L'ID du tenant optionnel.
 * @returns Le JWT signé.
 * @throws Error si le secret est manquant.
 */
export async function createEngineInternalToken(params: {
  ownerId: string;
  tenantId?: string;
}): Promise<string> {
  if (!INTERNAL_JWT_SECRET) {
    throw new Error(
      "[internal-auth] CREWAI_ENGINE_JWT_SECRET is not configured. Internal auth will fail.",
    );
  }

  if (!params.ownerId) {
    throw new Error("[internal-auth] ownerId is required to sign an internal token.");
  }

  const secret = new TextEncoder().encode(INTERNAL_JWT_SECRET);

  const token = await new SignJWT({
    owner_id: params.ownerId,
    tenant_id: params.tenantId ?? null,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("myswarms-bff")
    .setAudience("crewai-engine")
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .setSubject(params.ownerId)
    .sign(secret);

  return token;
}
