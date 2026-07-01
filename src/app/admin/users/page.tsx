import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { PageHeader, Chevron } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Utilisateurs" };

export default async function AdminUsersPage() {
  let superAdmin;
  try {
    superAdmin = await requireSuperAdmin();
  } catch {
    redirect("/login?returnTo=/admin/users");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 });

  const users = (error ? [] : data.users).map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    email_confirmed_at: u.email_confirmed_at ?? null,
    role: (u.app_metadata as Record<string, string>)?.role ?? "user",
  }));

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
        title="Utilisateurs"
        subtitle="Gestion des comptes et accès à la plateforme."
      />

      <AdminUsersClient
        initialUsers={users}
        superAdminEmail={superAdmin.email ?? ""}
      />
    </div>
  );
}
