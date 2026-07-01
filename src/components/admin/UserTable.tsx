"use client";

import { useState } from "react";
import { Table, THead, TBody, TR, TH, TD, Badge, Button } from "@/components/ui";

interface User {
  id: string;
  email: string | undefined;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  role: string;
}

interface UserTableProps {
  users: User[];
  superAdminEmail: string;
  onRefresh: () => void;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function UserTable({ users, superAdminEmail, onRefresh }: UserTableProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string, email: string | undefined) {
    if (!confirm(`Supprimer le compte ${email ?? id} ? Cette action est irréversible.`)) return;
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Table>
        <THead>
          <TR>
            <TH>Email</TH>
            <TH>Rôle</TH>
            <TH>Confirmé</TH>
            <TH>Dernière connexion</TH>
            <TH>Créé le</TH>
            <TH><span className="sr-only">Actions</span></TH>
          </TR>
        </THead>
        <TBody>
          {users.map((u) => {
            const isSelf = u.email === superAdminEmail;
            return (
              <TR key={u.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <span className="text-content-strong">{u.email ?? "—"}</span>
                    {isSelf && <Badge tone="accent">Vous</Badge>}
                  </div>
                </TD>
                <TD>
                  <Badge tone={u.role === "admin" ? "running" : "neutral"}>
                    {u.role}
                  </Badge>
                </TD>
                <TD>
                  {u.email_confirmed_at ? (
                    <span className="text-[var(--color-ok)]">✓</span>
                  ) : (
                    <span className="text-content-faint">En attente</span>
                  )}
                </TD>
                <TD className="text-xs text-content-muted">{formatDate(u.last_sign_in_at)}</TD>
                <TD className="text-xs text-content-muted">{formatDate(u.created_at)}</TD>
                <TD className="text-right">
                  {!isSelf && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(u.id, u.email)}
                      disabled={deleting === u.id}
                      className="text-danger hover:text-danger"
                    >
                      {deleting === u.id ? "…" : "Supprimer"}
                    </Button>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
