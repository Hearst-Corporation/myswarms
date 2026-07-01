"use client";

import { useState } from "react";
import { Field, Input, Select, Button } from "@/components/ui";

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Email" htmlFor="invite-email" className="min-w-[140px] flex-[2]">
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="user@example.com"
          />
        </Field>
        <Field label="Mot de passe" htmlFor="invite-password" className="min-w-[140px] flex-[2]">
          <Input
            id="invite-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="Min. 8 caractères"
          />
        </Field>
        <Field label="Rôle" htmlFor="invite-role" className="min-w-[100px] flex-1">
          <Select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as "user" | "admin")}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <Button type="submit" disabled={status === "loading"} className="whitespace-nowrap">
          {status === "loading" ? "Création…" : "+ Créer le compte"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
