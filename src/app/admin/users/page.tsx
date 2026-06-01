import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/superAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { Chevron } from "@/components/ui/Chevron";
import Link from "next/link";

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
    <>
      <div className="ct-eyebrow">
        <Link href="/workspace" style={{ color: "var(--ct-text-muted)", textDecoration: "none" }}>
          <Chevron direction="left" />Workspace
        </Link>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h1 className="ct-title">Utilisateurs</h1>
        <p className="ct-sub">Gestion des comptes et accès à la plateforme.</p>
      </div>

      <AdminUsersClient
        initialUsers={users}
        superAdminEmail={superAdmin.email ?? ""}
      />
    </>
  );
}
