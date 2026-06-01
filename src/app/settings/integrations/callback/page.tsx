import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { FONT, SPACING, RADIUS } from "@/lib/ui/tokens";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion intégration — MySwarms" };

interface PageProps {
  searchParams: Promise<{
    status?: string;
    connectedAccountId?: string;
    appName?: string;
    error?: string;
  }>;
}

export default async function ComposioCallbackPage({ searchParams }: PageProps) {
  try {
    await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) redirect("/login?returnTo=/settings?tab=integrations");
    throw err;
  }

  const params = await searchParams;
  const success = params.status === "success";
  const appName = params.appName ?? "l'intégration";
  const error = params.error;

  return (
    <div style={{
      minHeight: "60vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.xl,
      padding: SPACING.xxl,
      textAlign: "center",
    }}>
      <div style={{
        fontSize: 48,
        lineHeight: 1,
      }}>
        {success ? "✅" : "❌"}
      </div>

      <div>
        <h1 className="ct-title" style={{ marginBottom: SPACING.sm }}>
          {success
            ? `${appName} connecté`
            : "Connexion échouée"}
        </h1>
        <p className="ct-sub">
          {success
            ? `Ton compte ${appName} est maintenant disponible pour les agents.`
            : error ?? "Une erreur s'est produite lors de la connexion."}
        </p>
      </div>

      <Link
        href="/settings?tab=integrations"
        className="ct-seg-btn primary"
        style={{ padding: `${SPACING.sm}px ${SPACING.xl}px`, borderRadius: RADIUS.full }}
      >
        ← Retour aux intégrations
      </Link>
    </div>
  );
}
