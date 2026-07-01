"use client";

import type { ModelProvider } from "@/lib/forms/swarmSchemas";
import { Field, Select, Input, Label } from "@/components/ui";

interface LLMPickerProps {
  provider: ModelProvider;
  modelName: string;
  temperature: number;
  maxTokens: number;
  onProviderChange: (provider: ModelProvider) => void;
  onModelChange: (model: string) => void;
  onTemperatureChange: (temp: number) => void;
  onMaxTokensChange: (tokens: number) => void;
}

// Runtime enforcement: tous les providers sont routés vers l'API OpenAI officielle
// par _resolve_llm() dans services/crewai-engine/src/crews/dynamic_crew.py.
// gpt-4o = conversationnel/rapide, gpt-5.1 = agentique (orchestration, tool-use).
// kimi/hypercli restent acceptés en DB (legacy) mais routés vers OpenAI au runtime.
const OPENAI_MODELS = ["gpt-4o", "gpt-5.1"];

// Seuls les modèles OpenAI sont proposés — runtime-enforced.
// kimi/hypercli/anthropic gardés pour type-compat (rows DB legacy) mais
// pointent vers la même liste OpenAI.
const PROVIDER_MODELS: Record<ModelProvider, string[]> = {
  anthropic: OPENAI_MODELS, // DB legacy — engine routes to OpenAI
  openai: OPENAI_MODELS,
  kimi: OPENAI_MODELS, // DB legacy — engine routes to OpenAI
  hypercli: OPENAI_MODELS, // DB legacy — engine routes to OpenAI
};

const TEMP_MIN = 0;
const TEMP_MAX = 2;
const TEMP_STEP = 0.1;
const MAX_TOKENS_MIN = 256;
const MAX_TOKENS_MAX = 200_000;

export function LLMPicker({
  provider,
  modelName,
  temperature,
  maxTokens,
  onProviderChange,
  onModelChange,
  onTemperatureChange,
  onMaxTokensChange,
}: LLMPickerProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Runtime enforcement notice */}
      <div className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-xs text-content-muted ring-1 ring-inset ring-line">
        Provider enforced at runtime :{" "}
        <strong className="text-content-strong">OpenAI · gpt-4o / gpt-5.1</strong>. Any
        provider stored in DB is routed to OpenAI by the engine.
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Provider (stored)">
          <Select
            value={provider}
            onChange={(e) => {
              const next = e.target.value as ModelProvider;
              onProviderChange(next);
              const firstModel = PROVIDER_MODELS[next][0];
              if (firstModel) onModelChange(firstModel);
            }}
          >
            <option value="openai">openai (→ OpenAI officiel)</option>
            <option value="hypercli">hypercli (→ OpenAI, legacy)</option>
            <option value="kimi">kimi (→ OpenAI, legacy)</option>
            <option value="anthropic">anthropic (→ OpenAI, legacy)</option>
          </Select>
        </Field>

        <Field label="Model">
          <Select
            value={modelName}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {PROVIDER_MODELS[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {!PROVIDER_MODELS[provider].includes(modelName) && modelName ? (
              <option value={modelName}>{modelName} (stored)</option>
            ) : null}
          </Select>
        </Field>

        <div className="w-full">
          <Label>
            Temperature: <strong className="text-content">{temperature.toFixed(1)}</strong>
          </Label>
          <input
            type="range"
            min={TEMP_MIN}
            max={TEMP_MAX}
            step={TEMP_STEP}
            value={temperature}
            onChange={(e) => onTemperatureChange(Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
            aria-label="Temperature"
            aria-valuemin={TEMP_MIN}
            aria-valuemax={TEMP_MAX}
            aria-valuenow={temperature}
          />
        </div>

        <Field label="Max tokens">
          <Input
            type="number"
            min={MAX_TOKENS_MIN}
            max={MAX_TOKENS_MAX}
            value={maxTokens}
            onChange={(e) => onMaxTokensChange(Number(e.target.value))}
          />
        </Field>
      </div>
    </div>
  );
}
