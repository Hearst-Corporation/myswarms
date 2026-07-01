import { LoginForm } from "./LoginForm";
import { Alert } from "@/components/ui";

export const metadata = {
  title: "Sign in — MySwarms",
};

/**
 * Page de connexion Supabase email/password.
 *
 * Note : pas de page signup — les comptes sont créés via le dashboard Supabase
 * (https://app.supabase.com/project/fxeibmjebvxtoazuyyvz/auth/users).
 * MySwarms est mono-utilisateur, accès restreint.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  const returnTo = params?.returnTo ?? "/";
  const error = params?.error ?? null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="flex w-full max-w-sm flex-col items-center rounded-[var(--radius-xl)] bg-surface px-8 py-10 ring-1 ring-inset ring-line-strong shadow-lg shadow-black/40">
        {/* Logo / identité */}
        <div className="mb-6 flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-surface-3 ring-1 ring-inset ring-line-strong">
          <div className="size-5 rounded-full bg-accent-strong" aria-hidden="true" />
        </div>

        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-accent">
          MySwarms
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-content-strong">
          Sign in
        </h1>
        <p className="mt-1 text-center text-sm text-content-muted">
          Restricted access — authentication required.
        </p>

        {error === "unauthorized" && (
          <Alert tone="error" role="alert" className="mt-5 w-full text-center">
            Accès non autorisé. Ce compte n&apos;est pas admis sur cette plateforme.
          </Alert>
        )}

        <LoginForm returnTo={returnTo} />
      </div>
    </div>
  );
}
