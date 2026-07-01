"use client";

import { useId, useState } from "react";
import { ToolPicker } from "./ToolPicker";
import type {
  AgentInput,
  Tool,
  ToolBindingInput,
} from "@/lib/forms/swarmSchemas";
import { Card, CardHeader, CardTitle, CardBody, Field, Select } from "@/components/ui";

/**
 * G8 fix : tab "Tools" + `ToolsPickerWithAgentSelector` extrait de SwarmBuilder.
 * F5 fix conservé : le picker exige un agent sélectionné (chaque binding doit
 * cibler un agent assignable, sinon il serait orphelin au moment du save).
 */
interface BuilderToolsTabProps {
  availableTools: Tool[];
  toolBindings: ToolBindingInput[];
  agents: AgentInput[];
  onChange: (bindings: ToolBindingInput[]) => void;
}

export function BuilderToolsTab({
  availableTools,
  toolBindings,
  agents,
  onChange,
}: BuilderToolsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked tools</CardTitle>
      </CardHeader>
      <CardBody>
        <ToolsPickerWithAgentSelector
          availableTools={availableTools}
          selectedBindings={toolBindings}
          onChange={onChange}
          agents={agents}
        />
      </CardBody>
    </Card>
  );
}

// F5 fix : wrapper qui ajoute un select "Agent ciblé" au-dessus du ToolPicker.
function ToolsPickerWithAgentSelector({
  availableTools,
  selectedBindings,
  onChange,
  agents,
}: {
  availableTools: Tool[];
  selectedBindings: ToolBindingInput[];
  onChange: (bindings: ToolBindingInput[]) => void;
  agents: AgentInput[];
}) {
  // Seuls les agents persistés (avec id) sont assignables — sinon le binding
  // serait orphelin au moment du save.
  const assignableAgents = agents.filter((a) => a.id);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(
    assignableAgents[0]?.id ?? null,
  );
  const agentSelectId = useId();

  if (assignableAgents.length === 0) {
    return (
      <p className="text-sm text-content-faint">
        Add an agent in the Agents tab first to assign tools to it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Target agent" htmlFor={agentSelectId} className="max-w-xs">
        <Select
          id={agentSelectId}
          value={selectedAgentId ?? ""}
          onChange={(e) => setSelectedAgentId(e.target.value || null)}
        >
          {assignableAgents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <ToolPicker
        availableTools={availableTools}
        selectedBindings={selectedBindings}
        onChange={onChange}
        agentId={selectedAgentId}
      />
    </div>
  );
}
