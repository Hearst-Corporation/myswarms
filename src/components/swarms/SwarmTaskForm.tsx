"use client";

import { useState } from "react";
import type { AgentInput, TaskInput } from "@/lib/forms/swarmSchemas";
import { Button, Field, Input, Textarea, Select, Alert } from "@/components/ui";

interface SwarmTaskFormProps {
  initialTask?: TaskInput;
  agents: AgentInput[];
  tasks: TaskInput[];
  onSubmit: (task: TaskInput) => void;
  onCancel?: () => void;
}

// C4 : agent_id n'est plus nullable → initialiser sur le 1er agent dispo
// (le formulaire n'est plus accessible si aucun agent n'existe).
const buildDefaultTask = (agents: AgentInput[]): TaskInput => ({
  agent_id: agents.find((a) => a.id)?.id ?? "",
  name: "",
  description: "",
  expected_output: "",
  depends_on_task_id: null,
  position_x: 0,
  position_y: 0,
});

export function SwarmTaskForm({
  initialTask,
  agents,
  tasks,
  onSubmit,
  onCancel,
}: SwarmTaskFormProps) {
  const [task, setTask] = useState<TaskInput>(
    initialTask ?? buildDefaultTask(agents),
  );
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setError(null);
    setTask((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!task.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!task.agent_id) {
      setError("Assign an agent to the task.");
      return;
    }
    if (!task.description.trim()) {
      setError("Description is required.");
      return;
    }
    if (!task.expected_output.trim()) {
      setError("Expected output is required.");
      return;
    }
    onSubmit(task);
  };

  // Filtrer la tâche elle-même (cycle évident)
  const dependableTasks = tasks.filter((t) => t.id !== initialTask?.id);
  // C4 : seuls les agents persistés (avec id) peuvent être assignés.
  const assignableAgents = agents.filter((a) => a.id);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name">
          <Input
            type="text"
            value={task.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
        </Field>

        <Field label="Assigned agent">
          <Select
            value={task.agent_id ?? ""}
            onChange={(e) => update("agent_id", e.target.value)}
            required
          >
            {/* H1 : si la task chargée a agent_id null/vide (post cascade
                SET NULL), on affiche un placeholder explicite pour forcer
                un re-pair AVANT save (TaskInputSchema reste required). */}
            {!task.agent_id ? (
              <option value="" disabled>
                No agent — re-pair required
              </option>
            ) : null}
            {assignableAgents.length === 0 ? (
              <option value="" disabled>
                No agent — add one first
              </option>
            ) : (
              assignableAgents.map((a) => (
                <option key={a.id} value={a.id as string}>
                  {a.name} ({a.role})
                </option>
              ))
            )}
          </Select>
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          value={task.description}
          onChange={(e) => update("description", e.target.value)}
          required
          rows={4}
          className="font-mono"
        />
      </Field>

      <Field label="Expected output">
        <Textarea
          value={task.expected_output}
          onChange={(e) => update("expected_output", e.target.value)}
          required
          rows={3}
          className="font-mono"
        />
      </Field>

      <Field label="Depends on task">
        <Select
          value={task.depends_on_task_id ?? ""}
          onChange={(e) =>
            update(
              "depends_on_task_id",
              e.target.value === "" ? null : e.target.value,
            )
          }
        >
          <option value="">None (root)</option>
          {dependableTasks.map((t) =>
            t.id ? (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ) : null,
          )}
        </Select>
      </Field>

      {error ? (
        <Alert tone="error" role="alert">
          {error}
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary">
          {initialTask ? "Update" : "Add task"}
        </Button>
      </div>
    </form>
  );
}
