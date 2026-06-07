import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware d'authentification — pattern officiel @supabase/ssr (App Router).
 *
 * Deux rôles :
 *  1. **Refresh de session** : réécrit les cookies Supabase à chaque requête
 *     (les Server Components ne peuvent pas le faire). Sans ça, une session
 *     expirée n'est jamais rafraîchie → 401 erratiques / déconnexions.
 *  2. **Filet de protection** : redirige vers /login toute PAGE non publique
 *     consultée sans session. Les routes /api/* NE sont PAS redirigées — elles
 *     gardent leur 401 via requireOwnerId() (pas de 307 surprise pour un client
 *     API). Voir src/lib/auth/owner.ts.
 *
 * Cohérent avec getOwnerId()/getSuperAdmin() : le dev-bypass
 * (DEV_BYPASS_AUTH=true hors prod) court-circuite la redirection.
 */

/** Pages/réponses accessibles sans session (préfixes). */
const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/signout", "/api/health"];

async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT : aucune logique entre createServerClient et getUser() (cf docs
  // @supabase/ssr — sinon la session peut ne pas être rafraîchie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isApi = pathname.startsWith("/api");
  const devBypass =
    process.env.DEV_BYPASS_AUTH === "true" &&
    process.env.NODE_ENV !== "production";

  // Redirige uniquement les PAGES protégées. Les routes API conservent leur
  // 401 (requireOwnerId), le dev-bypass et les routes publiques passent.
  if (!user && !isPublic && !isApi && !devBypass) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(url);
  }

  // Retourner supabaseResponse (cookies de session propagés au navigateur).
  return supabaseResponse;
}

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tout sauf assets statiques Next.js + fichiers racine usuels.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
