"use client";

import { useState, useCallback } from "react";
import { InviteUserForm } from "./InviteUserForm";
import { UserTable } from "./UserTable";
import { SPACING } from "@/lib/ui/tokens";
import { SectionLabel } from "@/components/ui/SectionLabel";

interface User {
  id: string;
  email: string | undefined;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  role: string;
}

interface AdminUsersClientProps {
  initialUsers: User[];
  superAdminEmail: string;
}

export function AdminUsersClient({ initialUsers, superAdminEmail }: AdminUsersClientProps) {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json() as { users: User[] };
      setUsers(data.users);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xxl }}>
      {/* Créer un compte */}
      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SectionLabel text="Créer un nouveau compte" mb={SPACING.md} />
        <InviteUserForm onSuccess={refresh} />
      </section>

      {/* Liste des utilisateurs */}
      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.md }}>
          <SectionLabel text={`Utilisateurs — ${users.length}`} />
          <button
            type="button"
            className="ct-seg-btn"
            onClick={refresh}
            disabled={refreshing}
            style={{ fontSize: "var(--ct-font-size-xs)" }}
          >
            {refreshing ? "…" : "Actualiser"}
          </button>
        </div>
        <UserTable users={users} superAdminEmail={superAdminEmail} onRefresh={refresh} />
      </section>
    </div>
  );
}
