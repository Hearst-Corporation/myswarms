import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase avec service_role — bypass RLS complet.
 * À utiliser UNIQUEMENT dans les routes API admin protégées par isSuperAdmin().
 * Ne jamais exposer ce client côté client ou dans des routes publiques.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
