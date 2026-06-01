import { createClient } from "@/lib/supabase/server";

export interface SuperAdmin {
  id: string;
  email: string;
}

/**
 * Emails super-admin. Distinct de l'allowlist d'accès (ALLOWED_EMAIL, désormais
 * multi-tenant) : tous les tenants autorisés ne sont PAS super-admin. Source :
 * `SUPER_ADMIN_EMAIL` (liste virgules) si défini, sinon le PREMIER email
 * d'`ALLOWED_EMAIL` (rétro-compat : l'allowlist était mono-email = le super-admin).
 */
function superAdminEmails(): string[] {
  const raw =
    process.env.SUPER_ADMIN_EMAIL ??
    (process.env.ALLOWED_EMAIL ?? "").split(",")[0] ??
    "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Retourne le super-admin connecté, ou null.
 *
 * En dev-bypass (DEV_BYPASS_AUTH=true hors prod), l'accès super-admin est
 * accordé — cohérent avec getOwnerId() qui court-circuite l'auth en dev.
 */
export async function getSuperAdmin(): Promise<SuperAdmin | null> {
  if (
    process.env.DEV_BYPASS_AUTH === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return {
      id: process.env.DEV_BYPASS_OWNER_ID ?? "00000000-0000-0000-0000-000000000000",
      email: superAdminEmails()[0] ?? "dev@local",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  if (!superAdminEmails().includes(user.email.toLowerCase())) return null;
  return { id: user.id, email: user.email };
}

export async function requireSuperAdmin(): Promise<SuperAdmin> {
  const user = await getSuperAdmin();
  if (!user) throw new Error("Forbidden — super admin only");
  return user;
}
