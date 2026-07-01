"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field, Input, Button, Alert } from "@/components/ui";

/**
 * Formulaire de connexion email/password Supabase.
 *
 * Note : la création de comptes se fait exclusivement via le dashboard Supabase
 * (https://app.supabase.com/project/fxeibmjebvxtoazuyyvz/auth/users).
 * MySwarms est single-user — aucune page signup publique.
 */
export function LoginForm({ returnTo = "/" }: { returnTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Rafraîchir le Server Component pour que le middleware voie la session,
    // puis rediriger vers la page demandée (ou l'accueil par défaut).
    router.refresh();
    router.replace(returnTo);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex w-full flex-col gap-4">
      {error && (
        <Alert tone="error" role="alert">
          {error}
        </Alert>
      )}

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>

      <Button type="submit" disabled={loading} className="mt-2 w-full">
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
