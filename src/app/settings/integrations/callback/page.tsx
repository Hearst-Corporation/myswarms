import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui";

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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      {success ? (
        <CheckCircleIcon className="size-14 text-[var(--color-ok)]" aria-hidden="true" />
      ) : (
        <XCircleIcon className="size-14 text-[var(--color-danger)]" aria-hidden="true" />
      )}

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-content-strong">
          {success ? `${appName} connecté` : "Connexion échouée"}
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          {success
            ? `Ton compte ${appName} est maintenant disponible pour les agents.`
            : error ?? "Une erreur s'est produite lors de la connexion."}
        </p>
      </div>

      <Link href="/settings?tab=integrations">
        <Button variant="secondary">← Retour aux intégrations</Button>
      </Link>
    </div>
  );
}
