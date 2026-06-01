/**
 * /profile — destination du bouton avatar du shell Cockpit (RailLeft).
 *
 * Le shell utilise window.location.href = "/profile" (hard nav), donc on ne
 * peut pas éviter un rechargement. On élimine le DOUBLE rechargement causé
 * par l'ancien redirect("/settings?tab=profil") en rendant directement le
 * contenu ici plutôt que de rebondir vers /settings.
 */
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";
import Link from "next/link";

export const metadata = { title: "Profil — MySwarms" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) redirect("/login?returnTo=/profile");
    throw err;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      <div style={{ marginBottom: SPACING.xl }}>
        <h1 className="ct-title">Profil</h1>
        <p className="ct-sub">Informations de compte et accès rapide.</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xl, maxWidth: 560 }}>
        <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
          <SectionLabel text="Compte" mb={SPACING.md} />
          <div style={{ display: "flex", flexDirection: "column", gap: SPACING.md }}>
            <Field label="Email" value={user?.email ?? "—"} />
            <Field label="Owner ID" value={ownerId} mono />
            <Field label="Rôle" value={(user?.app_metadata as Record<string,string>)?.role ?? "user"} />
          </div>
        </section>

        <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
          <SectionLabel text="Navigation rapide" mb={SPACING.md} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: SPACING.md }}>
            <Link href="/settings?tab=integrations" className="ct-seg-btn">Intégrations</Link>
            <Link href="/settings?tab=sources" className="ct-seg-btn">Sources</Link>
            <Link href="/admin/users" className="ct-seg-btn">Utilisateurs</Link>
          </div>
        </section>

        <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
          <SectionLabel text="Session" mb={SPACING.md} />
          <p style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)", marginBottom: SPACING.md }}>
            Cliquez à nouveau sur l&apos;avatar en bas à gauche pour vous déconnecter.
          </p>
          <Link
            href="/auth/signout"
            className="ct-seg-btn"
            style={{ color: "var(--ct-alert-error-text)" }}
          >
            Se déconnecter
          </Link>
        </section>
      </div>
    </>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{
        fontSize: FONT.xs,
        color: "var(--ct-text-faint)",
        fontWeight: FONT_WEIGHT.bold,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: FONT.sm,
        color: "var(--ct-text-base)",
        fontFamily: mono ? "monospace" : undefined,
        wordBreak: "break-all",
        borderRadius: RADIUS.sm,
      }}>
        {value}
      </span>
    </div>
  );
}
