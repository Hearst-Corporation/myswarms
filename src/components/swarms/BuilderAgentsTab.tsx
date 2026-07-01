"use client";

import { useState } from "react";
import { SwarmAgentForm } from "./SwarmAgentForm";
import type { AgentInput } from "@/lib/forms/swarmSchemas";
import { Card, CardHeader, CardTitle, CardBody, Button } from "@/components/ui";

/**
 * G8 fix : tab "Agents" extrait de SwarmBuilder.
 * State local pour le formulaire (create + edit). Les mutations remontent au
 * parent via les callbacks `onAdd` / `onUpdate` / `onRemove`.
 */
interface BuilderAgentsTabProps {
  agents: AgentInput[];
  onAdd: (agent: AgentInput) => void;
  onUpdate: (idx: number, agent: AgentInput) => void;
  onRemove: (idx: number) => void;
}

export function BuilderAgentsTab({
  agents,
  onAdd,
  onUpdate,
  onRemove,
}: BuilderAgentsTabProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleAdd = (agent: AgentInput) => {
    onAdd(agent);
    setShowForm(false);
  };

  const handleUpdate = (idx: number, agent: AgentInput) => {
    onUpdate(idx, agent);
    setEditingIdx(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agents ({agents.length})</CardTitle>
        {!showForm && editingIdx === null ? (
          <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
            + Add
          </Button>
        ) : null}
      </CardHeader>
      <CardBody>
        {showForm ? (
          <SwarmAgentForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        ) : null}

        {editingIdx !== null && agents[editingIdx] ? (
          <SwarmAgentForm
            initialAgent={agents[editingIdx]}
            onSubmit={(a) => handleUpdate(editingIdx, a)}
            onCancel={() => setEditingIdx(null)}
          />
        ) : null}

        {agents.length > 0 && !showForm && editingIdx === null ? (
          <div className="flex flex-col gap-2">
            {agents.map((a, idx) => (
              <div
                key={a.id ?? idx}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-surface-2 p-3 ring-1 ring-inset ring-line"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-content-strong">{a.name}</div>
                  <div className="text-sm text-content-muted">
                    {a.role} · {a.model_provider}/{a.model_name}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Edit agent ${a.name}`}
                    onClick={() => setEditingIdx(idx)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Delete agent ${a.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete agent "${a.name}"?`)) {
                        onRemove(idx);
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {agents.length === 0 && !showForm ? (
          <p className="text-sm text-content-faint">
            No agent yet. Add at least one coordinator to start.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
