"use client";

import { useState } from "react";
import { SwarmTaskForm } from "./SwarmTaskForm";
import type { AgentInput, TaskInput } from "@/lib/forms/swarmSchemas";
import { Card, CardHeader, CardTitle, CardBody, Button } from "@/components/ui";

/**
 * G8 fix : tab "Tasks" extrait de SwarmBuilder.
 * Le `disabled` du bouton "+ Ajouter" et le placeholder dépendent de
 * `agents.length` — chaque task DOIT être assignée à un agent (C4 fix).
 */
interface BuilderTasksTabProps {
  agents: AgentInput[];
  tasks: TaskInput[];
  onAdd: (task: TaskInput) => void;
  onUpdate: (idx: number, task: TaskInput) => void;
  onRemove: (idx: number) => void;
}

export function BuilderTasksTab({
  agents,
  tasks,
  onAdd,
  onUpdate,
  onRemove,
}: BuilderTasksTabProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleAdd = (task: TaskInput) => {
    onAdd(task);
    setShowForm(false);
  };

  const handleUpdate = (idx: number, task: TaskInput) => {
    onUpdate(idx, task);
    setEditingIdx(null);
  };

  const noAgents = agents.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tasks ({tasks.length})</CardTitle>
        {!showForm && editingIdx === null ? (
          <>
            <span id="add-task-help" className="sr-only">
              Add at least one agent before adding a task.
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                if (noAgents) {
                  e.preventDefault();
                  return;
                }
                setShowForm(true);
              }}
              aria-disabled={noAgents}
              aria-describedby={noAgents ? "add-task-help" : undefined}
              title={noAgents ? "Add an agent first (Agents tab)" : undefined}
              className={noAgents ? "opacity-50" : undefined}
            >
              + Add
            </Button>
          </>
        ) : null}
      </CardHeader>
      <CardBody>
        {noAgents && !showForm ? (
          <p className="text-sm text-content-muted">
            Add an agent first — each task must be assigned to an agent.
          </p>
        ) : null}

        {showForm ? (
          <SwarmTaskForm
            agents={agents}
            tasks={tasks}
            onSubmit={handleAdd}
            onCancel={() => setShowForm(false)}
          />
        ) : null}

        {editingIdx !== null && tasks[editingIdx] ? (
          <SwarmTaskForm
            initialTask={tasks[editingIdx]}
            agents={agents}
            tasks={tasks}
            onSubmit={(t) => handleUpdate(editingIdx, t)}
            onCancel={() => setEditingIdx(null)}
          />
        ) : null}

        {tasks.length > 0 && !showForm && editingIdx === null ? (
          <div className="flex flex-col gap-2">
            {tasks.map((t, idx) => {
              const assignedAgent = agents.find((a) => a.id === t.agent_id);
              return (
                <div
                  key={t.id ?? idx}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-surface-2 p-3 ring-1 ring-inset ring-line"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-content-strong">{t.name}</div>
                    <div className="text-sm text-content-muted">
                      {assignedAgent ? `→ ${assignedAgent.name}` : "agent unassigned"}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Edit task ${t.name}`}
                      onClick={() => setEditingIdx(idx)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Delete task ${t.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete task "${t.name}"?`)) {
                          onRemove(idx);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {tasks.length === 0 && !showForm && !noAgents ? (
          <p className="text-sm text-content-faint">
            No task yet. Define what each agent must do.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
