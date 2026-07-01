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

// Runtime enforcement: all providers are routed to Hypercli (Kimi K2.6) at runtime
// by _resolve_llm() in services/crewai-engine/src/crews/dynamic_crew.py.
// Anthropic and OpenAI (real) options are removed from the UI to avoid confusion —
// any value stored in DB will be silently overridden by the engine anyway.
const HYPERCLI_MODELS = [
  "kimi-k2.6",
  "kimi-k2.6-anthropic",
  "kimi-k2.5",
  "kimi-k2.5-anthropic",
  "glm-5",
  "minimax-m2.5",
];

// Only Hypercli/Kimi providers exposed — runtime-enforced.
// anthropic and openai keys kept for type-compat but intentionally identical content.
const PROVIDER_MODELS: Record<ModelProvider, string[]> = {
  anthropic: HYPERCLI_MODELS, // DB legacy — engine routes to Hypercli
  openai: HYPERCLI_MODELS, // DB value — engine routes to Hypercli
  kimi: HYPERCLI_MODELS,
  hypercli: HYPERCLI_MODELS,
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
        <strong className="text-content-strong">Hypercli · Kimi K2.6</strong>. Any
        provider stored in DB is routed to Hypercli by the engine.
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
            <option value="openai">openai (→ Hypercli)</option>
            <option value="hypercli">hypercli (→ Hypercli)</option>
            <option value="kimi">kimi (→ Hypercli, legacy)</option>
            <option value="anthropic">anthropic (→ Hypercli, legacy)</option>
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
