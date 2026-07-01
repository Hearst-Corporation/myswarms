import { createClient } from "@/lib/supabase/server";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import type { Tool } from "@/lib/forms/swarmSchemas";
import { redirect } from "next/navigation";
import { PageHeader, Card, Alert, Badge, EmptyState, SectionLabel } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Charge les tools depuis Supabase directement — sans passer par le moteur Python.
 * Retourne les tools de l'owner courant PLUS les tools globaux (owner_id IS NULL),
 * qui sont accessibles grâce à la policy "tools_global_read" (lecture publique
 * pour authentifiés sur owner_id IS NULL).
 */
async function loadTools(): Promise<{ tools: Tool[]; dbError: string | null }> {
  try {
    const ownerId = await requireOwnerId();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("tools")
      .select("id, owner_id, name, category, description, endpoint_url, auth_type, schema_json, is_active, created_at, updated_at")
      .or(`owner_id.eq.${ownerId},owner_id.is.null`)
      .eq("is_active", true)
      .order("name");

    if (error) {
      return { tools: [], dbError: error.message };
    }

    // Cast minimal — le schéma Zod ToolSchema valide à la création, pas ici
    return { tools: (data ?? []) as Tool[], dbError: null };
  } catch (err) {
    if (err instanceof OwnerAuthError) {
      redirect("/login?returnTo=/tools");
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return { tools: [], dbError: message };
  }
}

export default async function ToolsPage() {
  const { tools, dbError } = await loadTools();
  const grouped = tools.reduce<Record<string, Tool[]>>((acc, tool) => {
    const cat = tool.category ?? "Other";
    (acc[cat] ??= []).push(tool);
    return acc;
  }, {});
  const categories = Object.entries(grouped).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Catalog"
        title="Tools"
        subtitle={`${tools.length} tool${tools.length > 1 ? "s" : ""} available for your agents.`}
      />

      {dbError ? (
        <Alert tone="warning" title="Erreur de chargement du catalog">
          <code className="font-mono text-xs">{dbError}</code>
        </Alert>
      ) : tools.length === 0 ? (
        <EmptyState
          title="Catalog vide"
          description="Aucun tool trouvé pour cet utilisateur. Provisionnez-en via une migration Supabase."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {categories.map(([cat, list]) => (
            <section key={cat} className="flex flex-col gap-3">
              <SectionLabel text={`${cat} · ${list.length}`} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((tool) => (
                  <Card key={tool.id} className="p-4">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-content-strong">
                        {tool.name}
                      </div>
                      {!tool.is_active ? (
                        <Badge tone="neutral">inactive</Badge>
                      ) : null}
                    </div>
                    {tool.description ? (
                      <div className="text-sm text-content-muted">
                        {tool.description}
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
