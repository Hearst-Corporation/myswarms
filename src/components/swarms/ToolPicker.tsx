"use client";

import { useMemo } from "react";
import type { Tool, ToolBindingInput } from "@/lib/forms/swarmSchemas";
import { cn } from "@/lib/ui/cn";

interface ToolPickerProps {
  availableTools: Tool[];
  selectedBindings: ToolBindingInput[];
  onChange: (bindings: ToolBindingInput[]) => void;
  // F5 fix : agent_id désormais REQUIRED côté schema Zod
  // (option a — cohérence stricte avec tasks). Le picker exige donc un
  // agent sélectionné pour activer les toggles. Sans agent → message
  // d'aide + toggles désactivés.
  agentId?: string | null;
}

/**
 * Multi-select de tools avec regroupement par catégorie. Toggle on/off + priority.
 * F5 fix : `agentId` requis pour activer les toggles. Si null/undefined,
 * affichage informatif et boutons disabled — aucun binding orphelin créé.
 */
export function ToolPicker({
  availableTools,
  selectedBindings,
  onChange,
  agentId = null,
}: ToolPickerProps) {
  const byCategory = useMemo(() => {
    const map = new Map<string, Tool[]>();
    for (const t of availableTools) {
      if (!t.is_active) continue;
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return map;
  }, [availableTools]);

  const selectedIds = useMemo(
    () => new Set(selectedBindings.map((b) => b.tool_id)),
    [selectedBindings],
  );

  const toggle = (tool: Tool) => {
    // F5 fix : refuse l'ajout sans agent — schema Zod rejetterait au save.
    if (!agentId && !selectedIds.has(tool.id)) return;
    if (selectedIds.has(tool.id)) {
      onChange(selectedBindings.filter((b) => b.tool_id !== tool.id));
    } else {
      onChange([
        ...selectedBindings,
        {
          tool_id: tool.id,
          agent_id: agentId as string,
          priority: 0,
          config_json: {},
        },
      ]);
    }
  };

  if (availableTools.length === 0) {
    return (
      <p className="text-sm text-content-faint">
        No tool available. Create some from the Tools page (coming).
      </p>
    );
  }

  if (!agentId) {
    return (
      <p className="text-sm text-content-faint">
        Select an agent first to assign tools.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {Array.from(byCategory.entries()).map(([category, tools]) => (
        <div key={category}>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-content-muted">
            {category}
          </div>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {tools.map((tool) => {
              const isSelected = selectedIds.has(tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => toggle(tool)}
                  aria-pressed={isSelected}
                  aria-label={`${tool.name} — ${isSelected ? "selected" : "not selected"}`}
                  className={cn(
                    "rounded-[var(--radius-md)] px-3 py-2 text-left ring-1 ring-inset transition-colors",
                    isSelected
                      ? "bg-accent/15 text-content-strong ring-accent/40"
                      : "bg-surface text-content ring-line hover:bg-surface-2",
                  )}
                >
                  <div className="font-semibold">{tool.name}</div>
                  {tool.description ? (
                    <div className="mt-1 text-sm text-content-muted">
                      {tool.description}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
