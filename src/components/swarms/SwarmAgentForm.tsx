"use client";

import { useState } from "react";
import { LLMPicker } from "./LLMPicker";
import {
  type AgentInput,
  type AgentRole,
  type ModelProvider,
  AgentRoleSchema,
} from "@/lib/forms/swarmSchemas";
import { Button, Field, Input, Textarea, Select, Alert } from "@/components/ui";

interface SwarmAgentFormProps {
  initialAgent?: AgentInput;
  onSubmit: (agent: AgentInput) => void;
  onCancel?: () => void;
}

// Default to openai/kimi-k2.6 — runtime enforces Hypercli on all providers.
// "openai" prefix is required by LiteLLM for the Hypercli OpenAI-compatible endpoint.
const DEFAULT_AGENT: AgentInput = {
  name: "",
  role: "executor",
  system_prompt: "",
  model_provider: "openai",
  model_name: "kimi-k2.6",
  temperature: 0.7,
  max_tokens: 4096,
  parent_agent_id: null,
  position_x: 0,
  position_y: 0,
};

export function SwarmAgentForm({
  initialAgent,
  onSubmit,
  onCancel,
}: SwarmAgentFormProps) {
  const [agent, setAgent] = useState<AgentInput>(initialAgent ?? DEFAULT_AGENT);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof AgentInput>(key: K, value: AgentInput[K]) => {
    setError(null);
    setAgent((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agent.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!agent.system_prompt.trim()) {
      setError("System prompt is required.");
      return;
    }
    onSubmit(agent);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name">
          <Input
            type="text"
            value={agent.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
        </Field>
        <Field label="Role">
          <Select
            value={agent.role}
            onChange={(e) => update("role", e.target.value as AgentRole)}
          >
            {AgentRoleSchema.options.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="System prompt">
        <Textarea
          value={agent.system_prompt}
          onChange={(e) => update("system_prompt", e.target.value)}
          required
          rows={6}
          className="font-mono"
        />
      </Field>

      <LLMPicker
        provider={agent.model_provider}
        modelName={agent.model_name}
        temperature={agent.temperature}
        maxTokens={agent.max_tokens}
        onProviderChange={(p: ModelProvider) => update("model_provider", p)}
        onModelChange={(m) => update("model_name", m)}
        onTemperatureChange={(t) => update("temperature", t)}
        onMaxTokensChange={(t) => update("max_tokens", t)}
      />

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
          {initialAgent ? "Update" : "Add agent"}
        </Button>
      </div>
    </form>
  );
}
