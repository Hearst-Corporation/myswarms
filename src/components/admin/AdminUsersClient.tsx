"use client";

import { useState, useCallback } from "react";
import { InviteUserForm } from "./InviteUserForm";
import { UserTable } from "./UserTable";
import { Card, CardHeader, CardTitle, CardBody, Button } from "@/components/ui";

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
    <div className="flex flex-col gap-8">
      {/* Créer un compte */}
      <Card>
        <CardHeader>
          <CardTitle>Créer un nouveau compte</CardTitle>
        </CardHeader>
        <CardBody>
          <InviteUserForm onSuccess={refresh} />
        </CardBody>
      </Card>

      {/* Liste des utilisateurs */}
      <Card>
        <CardHeader>
          <CardTitle>Utilisateurs — {users.length}</CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? "…" : "Actualiser"}
          </Button>
        </CardHeader>
        <CardBody>
          <UserTable users={users} superAdminEmail={superAdminEmail} onRefresh={refresh} />
        </CardBody>
      </Card>
    </div>
  );
}
