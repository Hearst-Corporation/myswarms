import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { getTenants } from "@/lib/platform-admin/data";
import { getGovernanceActions } from "@/lib/platform-admin/governance";
import { Chevron } from "@/components/ui/Chevron";
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
    <>
      <div className="ct-eyebrow">
        <Link href="/workspace" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
          <Chevron direction="left" />Workspace
        </Link>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h1 className="ct-title">Platform Admin</h1>
        <p className="ct-sub">
          Tenant &amp; Run Governance Console — qui utilise le backend, avec quels runs,
          quels droits, quels quotas, quels incidents.
        </p>
      </div>

      <PlatformConsole
        initialTenants={initial?.tenants ?? []}
        initialOverview={initial?.overview ?? null}
        initialBackend={initial?.backend ?? null}
        initialGates={initial?.gates ?? []}
        governanceActions={governanceActions}
        loadError={loadError}
      />
    </>
  );
}
