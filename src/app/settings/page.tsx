import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FONT, FONT_WEIGHT, RADIUS, SPACING } from "@/lib/ui/tokens";

export const metadata = { title: "Paramètres — MySwarms" };
export const dynamic = "force-dynamic";

type Tab = "profil" | "sources" | "integrations";
const TABS: { id: Tab; label: string }[] = [
  { id: "profil", label: "Profil" },
  { id: "sources", label: "Sources" },
  { id: "integrations", label: "Intégrations" },
];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  let ownerId: string;
  try {
    ownerId = await requireOwnerId();
  } catch (err) {
    if (err instanceof OwnerAuthError) redirect("/login?returnTo=/settings");
    throw err;
  }

  const { tab } = await searchParams;
  const activeTab: Tab = (TABS.find((t) => t.id === tab)?.id) ?? "profil";

  // Lire les infos utilisateur depuis Supabase
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: SPACING.xl }}>
        <h1 className="ct-title">Paramètres</h1>
        <p className="ct-sub">Profil, sources de données et intégrations.</p>
      </div>

      {/* Tab bar */}
      <div
        className="ct-seg-track"
        style={{ marginBottom: SPACING.xl }}
      >
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/settings?tab=${t.id}`}
            className={`ct-seg-btn${activeTab === t.id ? " active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "profil" && (
        <TabProfil email={user?.email ?? null} ownerId={ownerId} />
      )}
      {activeTab === "sources" && <TabSources />}
      {activeTab === "integrations" && <TabIntegrations />}
    </>
  );
}

// ── Onglet Profil ─────────────────────────────────────────────────────────────

function TabProfil({ email, ownerId }: { email: string | null; ownerId: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xl }}>
      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SectionLabel text="Compte" />
        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.md, marginTop: SPACING.md }}>
          <Field label="Email" value={email ?? "—"} />
          <Field label="Owner ID" value={ownerId} mono />
          <Field label="Workspace" value="Single workspace (owner-scoped)" />
        </div>
      </section>

      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SectionLabel text="Modèle LLM" />
        <div style={{ display: "flex", flexDirection: "column", gap: SPACING.md, marginTop: SPACING.md }}>
          <Field label="Provider" value="Hypercli" />
          <Field label="Modèle" value="Kimi K2.6" />
          <Field label="Endpoint" value="https://api.hypercli.com/v1" mono />
        </div>
        <p style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)", marginTop: SPACING.md }}>
          Le provider LLM est géré globalement. Pour changer de modèle, contactez l'administrateur.
        </p>
      </section>

      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SectionLabel text="Session" />
        <div style={{ marginTop: SPACING.md }}>
          <Link href="/auth/signout" className="ct-seg-btn" style={{ color: "var(--ct-alert-error-text)" }}>
            Se déconnecter
          </Link>
        </div>
      </section>
    </div>
  );
}

// ── Onglet Sources ────────────────────────────────────────────────────────────

function TabSources() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xl }}>
      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SectionLabel text="Sources automobile" />
        <p style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)", margin: `${SPACING.md}px 0` }}>
          Configurez les sources depuis lesquelles la plateforme peut extraire des données de véhicules.
        </p>
        <SourceRow
          name="AutoScout24"
          description="Extraction depuis une URL d'annonce AutoScout24.de / .fr / .be"
          status="coming_soon"
        />
        <SourceRow
          name="LeBonCoin"
          description="Extraction depuis une URL d'annonce LeBonCoin.fr"
          status="coming_soon"
        />
        <SourceRow
          name="Mobile.de"
          description="Extraction depuis une URL d'annonce Mobile.de"
          status="coming_soon"
        />
        <SourceRow
          name="URL manuelle"
          description="Coller une URL d'annonce — extraction automatique des champs"
          status="coming_soon"
        />
      </section>

      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SectionLabel text="VIN & historique véhicule" />
        <p style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)", margin: `${SPACING.md}px 0` }}>
          Connectez un service de décodage VIN pour enrichir automatiquement chaque analyse.
        </p>
        <SourceRow
          name="Vincario"
          description="Décodage VIN + historique kilométrique (3 checks/mois gratuits)"
          status="coming_soon"
        />
        <SourceRow
          name="AutoDNA"
          description="Rapport complet historique accident / total loss ($1–3/check)"
          status="coming_soon"
        />
      </section>
    </div>
  );
}

// ── Onglet Intégrations ───────────────────────────────────────────────────────

function TabIntegrations() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.xl }}>
      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SectionLabel text="Notifications" />
        <p style={{ fontSize: FONT.sm, color: "var(--ct-text-muted)", margin: `${SPACING.md}px 0` }}>
          Recevez les rapports d'analyse directement dans vos outils.
        </p>
        <IntegrationRow
          name="Telegram"
          description="Rapport envoyé dans un channel Telegram après chaque run"
          status="coming_soon"
        />
        <IntegrationRow
          name="Email"
          description="Rapport PDF envoyé par email via Resend"
          status="coming_soon"
        />
        <IntegrationRow
          name="Slack"
          description="Notification Slack avec résumé et recommandation"
          status="coming_soon"
        />
      </section>

      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SectionLabel text="Export" />
        <IntegrationRow
          name="Google Sheets"
          description="Exporter automatiquement les analyses dans un spreadsheet"
          status="coming_soon"
        />
        <IntegrationRow
          name="Notion"
          description="Créer une page Notion par analyse"
          status="coming_soon"
        />
      </section>

      <section className="ct-card" style={{ padding: `${SPACING.lx}px` }}>
        <SectionLabel text="Observabilité" />
        <IntegrationRow
          name="Langfuse"
          description="Traces LLM, coûts et latences par run"
          status="active"
          detail="Connecté — traces visibles sur langfuse.cloud"
        />
      </section>
    </div>
  );
}

// ── Composants utilitaires ────────────────────────────────────────────────────

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: FONT.xs, color: "var(--ct-text-faint)", fontWeight: FONT_WEIGHT.bold, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontSize: FONT.sm, color: "var(--ct-text-base)", fontFamily: mono ? "monospace" : undefined }}>
        {value}
      </span>
    </div>
  );
}

type Status = "active" | "coming_soon" | "error";

function StatusChip({ status, detail }: { status: Status; detail?: string }) {
  const map: Record<Status, { label: string; color: string; bg: string }> = {
    active:      { label: "Actif",       color: "var(--ct-status-success)", bg: "var(--ct-status-success-bg, rgba(34,197,94,.12))" },
    coming_soon: { label: "Bientôt",     color: "var(--ct-text-faint)",     bg: "var(--ct-surface-3)" },
    error:       { label: "Erreur",      color: "var(--ct-alert-error-text)", bg: "var(--ct-alert-error-bg, rgba(239,68,68,.12))" },
  };
  const { label, color, bg } = map[status];
  return (
    <span style={{ fontSize: FONT.xs, fontWeight: FONT_WEIGHT.bold, padding: `2px ${SPACING.s}px`, borderRadius: RADIUS.full, color, background: bg }}>
      {detail ?? label}
    </span>
  );
}

function SourceRow({ name, description, status, detail }: { name: string; description: string; status: Status; detail?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: `${SPACING.md}px 0`,
      borderBottom: "1px solid var(--ct-border)",
      gap: SPACING.lg,
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: FONT.sm, fontWeight: FONT_WEIGHT.bold, color: "var(--ct-text-base)", margin: 0 }}>{name}</p>
        <p style={{ fontSize: FONT.xs, color: "var(--ct-text-muted)", margin: `2px 0 0` }}>{description}</p>
      </div>
      <StatusChip status={status} detail={detail} />
    </div>
  );
}

function IntegrationRow({ name, description, status, detail }: { name: string; description: string; status: Status; detail?: string }) {
  return <SourceRow name={name} description={description} status={status} detail={detail} />;
}
