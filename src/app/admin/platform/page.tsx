import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { getTenants } from "@/lib/platform-admin/data";
import { getGovernanceActions } from "@/lib/platform-admin/governance";
import { PageHeader, Chevron } from "@/components/ui";
import { PlatformConsole } from "@/components/platform-admin/PlatformConsole";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata = { title: "Platform Admin — Tenant Governance" };

/**
 * Platform Admin Console — page server.
 *
 * Admin-only : requireSuperAdmin() throw -> redirect /login. Fail-closed.
 * Charge l'agrégation initiale côté serveur (service_role via data-access,
 * tout rédacté) et passe des props 100% safe au composant client.
 */
export default async function PlatformAdminPage() {
  try {
    await requireSuperAdmin();
  } catch {
    redirect("/login?returnTo=/admin/platform");
  }

  let initial: Awaited<ReturnType<typeof getTenants>> | null = null;
  let loadError: string | null = null;
  try {
    initial = await getTenants();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Échec du chargement des tenants";
  }

  const governanceActions = getGovernanceActions();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/workspace"
        className="inline-flex w-fit items-center text-xs font-semibold uppercase tracking-wider text-content-muted transition-colors hover:text-content"
      >
        <Chevron direction="left" />
        Workspace
      </Link>

      <PageHeader
        title="Platform Admin"
        subtitle="Tenant & Run Governance Console — qui utilise le backend, avec quels runs, quels droits, quels quotas, quels incidents."
      />

      <PlatformConsole
        initialTenants={initial?.tenants ?? []}
        initialOverview={initial?.overview ?? null}
        initialBackend={initial?.backend ?? null}
        initialGates={initial?.gates ?? []}
        governanceActions={governanceActions}
        loadError={loadError}
      />
    </div>
  );
}
