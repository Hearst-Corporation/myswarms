"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  SPACING,
  RADIUS,
  FONT,
  FONT_WEIGHT,
  LETTER_SPACING,
  LINE_HEIGHT,
  TRANSITION,
} from "@/lib/ui/tokens";

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
  const [redirecting, setRedirecting] = useState(false);

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
    setRedirecting(true);
    router.refresh();
    router.replace(returnTo);
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 360 }}>
      {redirecting && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            marginBottom: SPACING.lg,
            padding: `${SPACING.s}px ${SPACING.md}px`,
            borderRadius: RADIUS.md,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border-strong)",
            color: "var(--ct-text-primary)",
            fontSize: FONT.base,
            lineHeight: LINE_HEIGHT.tight,
          }}
        >
          Connexion réussie — redirection en cours…
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          style={{
            marginBottom: SPACING.lg,
            padding: `${SPACING.s}px ${SPACING.md}px`,
            borderRadius: RADIUS.md,
            background: "var(--ct-alert-error-bg)",
            border: "1px solid var(--ct-alert-error-border)",
            color: "var(--ct-alert-error-text)",
            fontSize: FONT.base,
            lineHeight: LINE_HEIGHT.tight,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: SPACING.lg }}>
        <label
          htmlFor="email"
          style={{
            display: "block",
            fontSize: FONT.xxs,
            fontWeight: FONT_WEIGHT.bold,
            letterSpacing: LETTER_SPACING.tight,
            textTransform: "uppercase",
            color: "var(--ct-text-muted)",
            marginBottom: SPACING.xxs,
          }}
        >
          Adresse e-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          style={{
            width: "100%",
            padding: `${SPACING.s}px ${SPACING.md}px`,
            borderRadius: RADIUS.md,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border-strong)",
            color: "var(--ct-text-primary)",
            fontSize: FONT.md,
            fontFamily: "inherit",
            transition: `border-color ${TRANSITION.fast}`,
          }}
        />
      </div>

      <div style={{ marginBottom: SPACING.xl }}>
        <label
          htmlFor="password"
          style={{
            display: "block",
            fontSize: FONT.xxs,
            fontWeight: FONT_WEIGHT.bold,
            letterSpacing: LETTER_SPACING.tight,
            textTransform: "uppercase",
            color: "var(--ct-text-muted)",
            marginBottom: SPACING.xxs,
          }}
        >
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{
            width: "100%",
            padding: `${SPACING.s}px ${SPACING.md}px`,
            borderRadius: RADIUS.md,
            background: "var(--ct-surface-2)",
            border: "1px solid var(--ct-border-strong)",
            color: "var(--ct-text-primary)",
            fontSize: FONT.md,
            fontFamily: "inherit",
            transition: `border-color ${TRANSITION.fast}`,
          }}
        />
      </div>

      <button
        type="submit"
        disabled={loading || redirecting}
        aria-busy={loading || redirecting}
        className="ct-seg-btn primary"
        style={{ width: "100%" }}
      >
        {redirecting ? "Redirection…" : loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
