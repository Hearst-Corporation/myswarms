import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  Badge,
  Button,
} from "@/components/ui";
import { ConnectButton } from "@/components/settings/ConnectButton";
import { cn } from "@/lib/ui/cn";

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Paramètres"
        subtitle="Profil, sources de données et intégrations."
      />

      {/* Tab bar */}
      <div
        className="inline-flex w-fit gap-1 rounded-[var(--radius-md)] bg-surface-2 p-1 ring-1 ring-inset ring-line"
        role="tablist"
      >
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/settings?tab=${t.id}`}
            role="tab"
            aria-selected={activeTab === t.id}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === t.id
                ? "bg-surface text-content-strong ring-1 ring-inset ring-line"
                : "text-content-muted hover:text-content",
            )}
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
    </div>
  );
}

// ── Onglet Profil ─────────────────────────────────────────────────────────────

function TabProfil({ email, ownerId }: { email: string | null; ownerId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Compte</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <FieldRow label="Email" value={email ?? "—"} />
          <FieldRow label="Owner ID" value={ownerId} mono />
          <FieldRow label="Workspace" value="Single workspace (owner-scoped)" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modèle LLM</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <FieldRow label="Provider" value="OpenAI" />
          <FieldRow label="Modèle conversationnel" value="GPT-4o" />
          <FieldRow label="Modèle agentique" value="GPT-5.1" />
          <FieldRow label="Endpoint" value="https://api.openai.com/v1" mono />
          <p className="text-xs text-content-faint">
            Le provider LLM est géré globalement. Pour changer de modèle, contactez l&apos;administrateur.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap items-center gap-3">
          <Link href="/auth/signout">
            <Button variant="danger" size="sm">Se déconnecter</Button>
          </Link>
          <Link href="/admin/users">
            <Button variant="secondary" size="sm">Gestion des utilisateurs</Button>
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}

// ── Onglet Sources ────────────────────────────────────────────────────────────

function TabSources() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sources de données</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col">
        <p className="mb-2 text-sm text-content-muted">
          Configurez les sources depuis lesquelles les agents peuvent extraire des données.
        </p>
        <SourceRow name="Gmail" description="Lecture et envoi d'emails via les agents CrewAI" status="coming_soon" />
        <SourceRow name="Slack" description="Messages et notifications Slack via les agents" status="coming_soon" />
        <SourceRow name="Google Drive" description="Accès aux documents Drive depuis les agents" status="coming_soon" />
        <SourceRow name="Notion" description="Lecture et écriture de pages Notion" status="coming_soon" last />
      </CardBody>
    </Card>
  );
}

// ── Onglet Intégrations ───────────────────────────────────────────────────────

function TabIntegrations() {
  return (
    <div className="flex flex-col gap-6">
      {/* Section Composio — intégrations actives */}
      <Card>
        <CardHeader>
          <CardTitle>Outils connectés (Composio)</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col">
          <p className="mb-2 text-sm text-content-muted">
            Connectez vos comptes pour que les agents puissent agir en votre nom.
          </p>
          <ConnectedRow
            name="Gmail"
            description="Envoyer et lire des emails via les agents CrewAI"
            toolkit="gmail"
          />
          <ConnectedRow
            name="Trello"
            description="Créer et déplacer des cartes Trello via les agents CrewAI"
            toolkit="trello"
            last
          />
        </CardBody>
      </Card>

      {/* Section Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col">
          <p className="mb-2 text-sm text-content-muted">
            Recevez les rapports d&apos;analyse directement dans vos outils.
          </p>
          <SourceRow
            name="Telegram"
            description="Rapport envoyé dans un channel Telegram après chaque run"
            status="coming_soon"
          />
          <SourceRow
            name="Email"
            description="Rapport PDF envoyé par email via Resend"
            status="coming_soon"
          />
          <SourceRow
            name="Slack"
            description="Notification Slack avec résumé et recommandation"
            status="coming_soon"
            last
          />
        </CardBody>
      </Card>

      {/* Section Export */}
      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col">
          <SourceRow
            name="Google Sheets"
            description="Exporter automatiquement les analyses dans un spreadsheet"
            status="coming_soon"
          />
          <SourceRow
            name="Notion"
            description="Créer une page Notion par analyse"
            status="coming_soon"
            last
          />
        </CardBody>
      </Card>

      {/* Section Observabilité */}
      <Card>
        <CardHeader>
          <CardTitle>Observabilité</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col">
          <SourceRow
            name="Langfuse"
            description="Traces LLM, coûts et latences par run"
            status="active"
            detail="Connecté — traces visibles sur langfuse.cloud"
            last
          />
        </CardBody>
      </Card>

      {/* Section Outils agents */}
      <Card>
        <CardHeader>
          <CardTitle>Outils agents</CardTitle>
          <Link href="/tools" className="text-xs font-medium text-accent hover:text-accent-strong">
            Voir le catalog →
          </Link>
        </CardHeader>
        <CardBody className="flex flex-col">
          <p className="mb-2 text-sm text-content-muted">
            Outils disponibles pour les agents CrewAI dans tes swarms.
          </p>
          <SourceRow
            name="Gmail"
            description="Envoyer, lire et gérer les emails via les agents"
            status="active"
            detail="Connecté via Composio"
          />
          <SourceRow
            name="Trello"
            description="Créer et déplacer des cartes Trello via les agents"
            status="active"
            detail="Connecté via Composio"
            last
          />
        </CardBody>
      </Card>
    </div>
  );
}

// ── Composants utilitaires ────────────────────────────────────────────────────

function FieldRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-bold uppercase tracking-wider text-content-faint">
        {label}
      </span>
      <span className={cn("text-sm text-content", mono && "font-mono break-all")}>
        {value}
      </span>
    </div>
  );
}

type Status = "active" | "coming_soon" | "error";

function StatusChip({ status, detail }: { status: Status; detail?: string }) {
  const map: Record<Status, { label: string; tone: "ok" | "neutral" | "danger" }> = {
    active: { label: "Actif", tone: "ok" },
    coming_soon: { label: "Bientôt", tone: "neutral" },
    error: { label: "Erreur", tone: "danger" },
  };
  const { label, tone } = map[status];
  return <Badge tone={tone}>{detail ?? label}</Badge>;
}

function SourceRow({
  name,
  description,
  status,
  detail,
  last = false,
}: {
  name: string;
  description: string;
  status: Status;
  detail?: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-3",
        !last && "border-b border-line",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-content">{name}</p>
        <p className="mt-0.5 text-xs text-content-muted">{description}</p>
      </div>
      <StatusChip status={status} detail={detail} />
    </div>
  );
}

// ConnectedRow — utilise le ConnectButton (island client)
function ConnectedRow({
  name,
  description,
  toolkit,
  last = false,
}: {
  name: string;
  description: string;
  toolkit: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-3",
        !last && "border-b border-line",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-content">{name}</p>
        <p className="mt-0.5 text-xs text-content-muted">{description}</p>
      </div>
      <ConnectButton toolkit={toolkit} label={name} />
    </div>
  );
}
