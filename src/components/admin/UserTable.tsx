"use client";

import { useState } from "react";
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

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

  const thStyle: React.CSSProperties = {
    padding: `${SPACING.sm}px ${SPACING.md}px`,
    textAlign: "left",
    fontSize: FONT.xs,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: LETTER_SPACING.wide,
    textTransform: "uppercase",
    color: "var(--ct-text-muted)",
    borderBottom: "1px solid var(--ct-border)",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: `${SPACING.sm}px ${SPACING.md}px`,
    fontSize: FONT.sm,
    color: "var(--ct-text-base)",
    borderBottom: "1px solid var(--ct-border)",
    verticalAlign: "middle",
  };

  return (
    <div>
      {error && (
        <p role="alert" style={{ fontSize: FONT.sm, color: "var(--ct-alert-error-text)", marginBottom: SPACING.md }}>
          {error}
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Rôle</th>
              <th style={thStyle}>Confirmé</th>
              <th style={thStyle}>Dernière connexion</th>
              <th style={thStyle}>Créé le</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.email === superAdminEmail;
              return (
                <tr key={u.id}>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: SPACING.sm }}>
                      <span>{u.email ?? "—"}</span>
                      {isSelf && (
                        <span style={{
                          fontSize: FONT.xxs,
                          fontWeight: FONT_WEIGHT.bold,
                          padding: `1px ${SPACING.xs}px`,
                          borderRadius: RADIUS.full,
                          background: "var(--ct-accent-strong)",
                          color: "var(--ct-text-strong)",
                          textTransform: "uppercase",
                          letterSpacing: LETTER_SPACING.wide,
                        }}>
                          Vous
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: FONT.xs,
                      fontWeight: FONT_WEIGHT.bold,
                      padding: `1px ${SPACING.xs}px`,
                      borderRadius: RADIUS.full,
                      background: u.role === "admin" ? "var(--ct-status-running-bg)" : "var(--ct-surface-3)",
                      color: u.role === "admin" ? "var(--ct-accent-strong)" : "var(--ct-text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: LETTER_SPACING.wide,
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {u.email_confirmed_at
                      ? <span style={{ color: "var(--ct-status-completed)" }}>✓</span>
                      : <span style={{ color: "var(--ct-text-faint)" }}>En attente</span>}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--ct-text-muted)", fontSize: FONT.xs }}>{formatDate(u.last_sign_in_at)}</td>
                  <td style={{ ...tdStyle, color: "var(--ct-text-muted)", fontSize: FONT.xs }}>{formatDate(u.created_at)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id, u.email)}
                        disabled={deleting === u.id}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "var(--ct-alert-error-text)",
                          fontSize: FONT.xs,
                          padding: `${SPACING.xs}px ${SPACING.sm}px`,
                          borderRadius: RADIUS.sm,
                          opacity: deleting === u.id ? 0.5 : 1,
                        }}
                      >
                        {deleting === u.id ? "…" : "Supprimer"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
