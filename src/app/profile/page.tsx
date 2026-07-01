/**
 * /profile — destination du bouton avatar du shell Cockpit (RailLeft).
 *
 * Le shell utilise window.location.href = "/profile" (hard nav), donc on ne
 * peut pas éviter un rechargement. On élimine le DOUBLE rechargement causé
 * par l'ancien redirect("/settings?tab=profil") en rendant directement le
 * contenu ici plutôt que de rebondir vers /settings.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Button,
} from "@/components/ui";
import { cn } from "@/lib/ui/cn";

export const metadata = { title: "Profil — MySwarms" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) redirect("/login?returnTo=/profile");
    throw err;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Profil"
        subtitle="Informations de compte et accès rapide."
      />

      <Card>
        <CardHeader>
          <CardTitle>Compte</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <FieldRow label="Email" value={user?.email ?? "—"} />
          <FieldRow label="Owner ID" value={ownerId} mono />
          <FieldRow label="Rôle" value={(user?.app_metadata as Record<string, string>)?.role ?? "user"} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Navigation rapide</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-3">
          <Link href="/settings?tab=integrations">
            <Button variant="secondary" size="sm">Intégrations</Button>
          </Link>
          <Link href="/settings?tab=sources">
            <Button variant="secondary" size="sm">Sources</Button>
          </Link>
          <Link href="/admin/users">
            <Button variant="secondary" size="sm">Utilisateurs</Button>
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-xs text-content-faint">
            Cliquez à nouveau sur l&apos;avatar en bas à gauche pour vous déconnecter.
          </p>
          <Link href="/auth/signout" className="w-fit">
            <Button variant="danger" size="sm">Se déconnecter</Button>
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}

function FieldRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-bold uppercase tracking-wider text-content-faint">
        {label}
      </span>
      <span className={cn("text-sm text-content", mono && "font-mono break-all")}>
        {value}
      </span>
    </div>
  );
}
