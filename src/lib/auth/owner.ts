/**
 * Auth helper — session Supabase réelle via @supabase/ssr.
 *
 * getOwnerId() lit la session Supabase serveur et retourne l'UUID de l'utilisateur
 * connecté, ou null si aucune session n'est active. Fail-closed strict : aucun
 * fallback env en production (le DEV_OWNER_ID stub a été retiré — le middleware
 * protège toutes les routes et garantit qu'un user est toujours présent).
 *
 * requireOwnerId() appelle getOwnerId() et throw OwnerAuthError si null —
 * contrat inchangé pour tous les call-sites existants (routes API, pages SSR).
 *
 * Voir : src/middleware.ts (updateSession — refresh session à chaque requête)
 *        src/lib/supabase/server.ts (createClient — client Supabase serveur)
 *        src/app/login/ (formulaire connexion email/password)
 *        src/app/auth/signout/route.ts (déconnexion)
 */

import { createClient } from "@/lib/supabase/server";
import { isDevBypassEnabled, devBypassOwnerId } from "@/lib/auth/devBypass";

// Garde anti-spam : le warning dev-bypass ne s'affiche qu'une fois par process
// (sinon il se répète à chaque appel getOwnerId, désormais aussi via le layout).
let devBypassWarned = false;

/**
 * Erreur levée par requireOwnerId() quand aucune session n'est active.
 * Les route handlers attrapent cette classe et retournent 401.
 * Signature publique inchangée — ne pas modifier.
 */
export class OwnerAuthError extends Error {
  constructor(message = "Unauthorized — no active session") {
    super(message);
    this.name = "OwnerAuthError";
  }
}

/**
 * Retourne l'UUID de l'utilisateur Supabase connecté, ou null si déconnecté.
 *
 * Utilise getUser() (vérification serveur cryptographique) plutôt que getSession()
 * (lecture cookie non vérifiée) — cf. recommandation officielle Supabase.
 *
 * Signature : Promise<string | null> — inchangée.
 */
export async function getOwnerId(): Promise<string | null> {
  // Dev-only bypass : DEV_BYPASS_AUTH=true + NODE_ENV != "production"
  // retourne un UUID stub (overridable via DEV_BYPASS_OWNER_ID) pour skipper
  // toute la chaîne d'auth Supabase. Fermé automatiquement en prod.
  if (isDevBypassEnabled()) {
    // Warn loudly in dev so the bypass is never forgotten — mais une seule fois
    // par process (anti-spam). Fail-closed en prod : isDevBypassEnabled() retourne
    // false sur tout environnement Vercel (prod + preview) et tout NODE_ENV=production.
    if (!devBypassWarned && typeof console !== "undefined") {
      devBypassWarned = true;
      console.warn(
        "[auth] DEV_BYPASS_AUTH=true — authentication is DISABLED. " +
        "All requests treated as owner_id=" +
        devBypassOwnerId() +
        ". Set DEV_BYPASS_AUTH=false to use real Supabase auth."
      );
    }
    return devBypassOwnerId();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Retourne l'UUID de l'utilisateur connecté ou throw OwnerAuthError.
 *
 * À utiliser dans toutes les routes API qui requièrent une authentification.
 * Signature : Promise<string> — inchangée.
 *
 * @throws {OwnerAuthError} si aucune session active.
 */
export async function requireOwnerId(): Promise<string> {
  const id = await getOwnerId();
  if (!id) {
    throw new OwnerAuthError();
  }
  return id;
}
