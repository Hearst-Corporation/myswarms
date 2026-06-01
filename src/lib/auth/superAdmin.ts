import { createClient } from "@/lib/supabase/server";

/**
 * Vérifie que l'utilisateur connecté est le super admin.
 * Critère : email === ALLOWED_EMAIL (seul compte autorisé sur la plateforme).
 * Retourne l'user Supabase ou null.
 */
export async function getSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const allowedEmail = process.env.ALLOWED_EMAIL;
  if (!allowedEmail || user.email !== allowedEmail) return null;
  return user;
}

export async function requireSuperAdmin() {
  const user = await getSuperAdmin();
  if (!user) throw new Error("Forbidden — super admin only");
  return user;
}
