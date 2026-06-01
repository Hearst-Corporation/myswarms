"use client";

import { useState } from "react";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";

interface InviteUserFormProps {
  onSuccess: () => void;
}

export function InviteUserForm({ onSuccess }: InviteUserFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEmail("");
      setPassword("");
      setRole("user");
      setStatus("idle");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: SPACING.md }}>
      <div style={{ display: "flex", gap: SPACING.md, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 140, display: "flex", flexDirection: "column", gap: SPACING.xs }}>
          <label style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", fontWeight: FONT_WEIGHT.bold, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="user@example.com"
            style={{
              background: "var(--ct-surface-3)",
              border: "1px solid var(--ct-border)",
              borderRadius: RADIUS.md,
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              color: "var(--ct-text-body)",
              fontSize: FONT.sm,
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 2, minWidth: 140, display: "flex", flexDirection: "column", gap: SPACING.xs }}>
          <label style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", fontWeight: FONT_WEIGHT.bold, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Mot de passe
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Min. 8 caractères"
            style={{
              background: "var(--ct-surface-3)",
              border: "1px solid var(--ct-border)",
              borderRadius: RADIUS.md,
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              color: "var(--ct-text-body)",
              fontSize: FONT.sm,
              outline: "none",
            }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 100, display: "flex", flexDirection: "column", gap: SPACING.xs }}>
          <label style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", fontWeight: FONT_WEIGHT.bold, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Rôle
          </label>
          <select
            value={role}
            onChange={e => setRole(e.target.value as "user" | "admin")}
            style={{
              background: "var(--ct-surface-3)",
              border: "1px solid var(--ct-border)",
              borderRadius: RADIUS.md,
              padding: `${SPACING.sm}px ${SPACING.md}px`,
              color: "var(--ct-text-body)",
              fontSize: FONT.sm,
              outline: "none",
            }}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button
            type="submit"
            className="ct-seg-btn primary"
            disabled={status === "loading"}
            style={{ whiteSpace: "nowrap" }}
          >
            {status === "loading" ? "Création…" : "+ Créer le compte"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" style={{ fontSize: FONT.sm, color: "var(--ct-alert-error-text)", margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}
