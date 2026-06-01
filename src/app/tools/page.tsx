import { createClient } from "@/lib/supabase/server";
import { requireOwnerId, OwnerAuthError } from "@/lib/auth/owner";
import type { Tool } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, SPACING } from "@/lib/ui/tokens";
import { redirect } from "next/navigation";

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
    <>
      <span className="ct-eyebrow">Catalog</span>
      <h1 className="ct-title">Tools</h1>
      <p className="ct-sub">
        {tools.length} tool{tools.length > 1 ? "s" : ""} available for your agents.
      </p>

      {dbError ? (
        <div
          className="ct-card"
          style={{
            background: "var(--ct-alert-warning-bg)",
            borderColor: "var(--ct-alert-warning-border)",
          }}
        >
          <div
            className="ct-card-title"
            style={{ color: "var(--ct-alert-warning-text)" }}
          >
            Erreur de chargement du catalog
          </div>
          <div className="ct-card-body">
            <code>{dbError}</code>
          </div>
        </div>
      ) : tools.length === 0 ? (
        <div className="ct-card">
          <div className="ct-card-title">Catalog vide</div>
          <div className="ct-placeholder">
            Aucun tool trouvé pour cet utilisateur.
            Provisionnez-en via une migration Supabase.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: SPACING.xl,
          }}
        >
          {categories.map(([cat, list]) => (
            <section key={cat}>
              <div
                style={{
                  fontSize: FONT.xs,
                  fontWeight: FONT_WEIGHT.bold,
                  letterSpacing: LETTER_SPACING.wide,
                  textTransform: "uppercase",
                  color: "var(--ct-text-muted)",
                  marginBottom: SPACING.sm,
                }}
              >
                {cat} · {list.length}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill, minmax(var(--ct-card-min-w), 1fr))",
                  gap: SPACING.md,
                }}
              >
                {list.map((tool) => (
                  <div
                    key={tool.id}
                    className="ct-card"
                    style={{ marginBottom: 0 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: SPACING.sm,
                        marginBottom: SPACING.xs,
                      }}
                    >
                      <div
                        style={{
                          fontSize: FONT.md,
                          fontWeight: FONT_WEIGHT.semibold,
                          color: "var(--ct-text-strong)",
                        }}
                      >
                        {tool.name}
                      </div>
                      {!tool.is_active ? (
                        <span
                          style={{
                            fontSize: FONT.xxs,
                            color: "var(--ct-text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: LETTER_SPACING.wide,
                          }}
                        >
                          inactive
                        </span>
                      ) : null}
                    </div>
                    {tool.description ? (
                      <div
                        style={{
                          fontSize: FONT.sm,
                          color: "var(--ct-text-body)",
                        }}
                      >
                        {tool.description}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
