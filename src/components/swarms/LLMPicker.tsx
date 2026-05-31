"use client";

import type { ModelProvider } from "@/lib/forms/swarmSchemas";
import { FONT, FONT_WEIGHT, LETTER_SPACING, RADIUS, SPACING } from "@/lib/ui/tokens";

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
  anthropic: HYPERCLI_MODELS,  // DB legacy — engine routes to Hypercli
  openai: HYPERCLI_MODELS,     // DB value — engine routes to Hypercli
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
    <div style={{ display: "flex", flexDirection: "column", gap: SPACING.md }}>
      {/* Runtime enforcement notice */}
      <div
        style={{
          fontSize: FONT.xs,
          color: "var(--ct-text-muted)",
          background: "var(--ct-surface-2)",
          border: "1px solid var(--ct-border-soft)",
          borderRadius: RADIUS.md,
          padding: `${SPACING.xs}px ${SPACING.md}px`,
        }}
      >
        Provider enforced at runtime : <strong style={{ color: "var(--ct-text-primary)" }}>Hypercli · Kimi K2.6</strong>.
        {" "}Any provider stored in DB is routed to Hypercli by the engine.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACING.lg }}>
      <label style={labelStyle}>
        <span style={labelText}>Provider (stored)</span>
        <select
          value={provider}
          onChange={(e) => {
            const next = e.target.value as ModelProvider;
            onProviderChange(next);
            const firstModel = PROVIDER_MODELS[next][0];
            if (firstModel) onModelChange(firstModel);
          }}
          style={inputStyle}
        >
          <option value="openai">openai (→ Hypercli)</option>
          <option value="hypercli">hypercli (→ Hypercli)</option>
          <option value="kimi">kimi (→ Hypercli, legacy)</option>
          <option value="anthropic">anthropic (→ Hypercli, legacy)</option>
        </select>
      </label>

      <label style={labelStyle}>
        <span style={labelText}>Model</span>
        <select
          value={modelName}
          onChange={(e) => onModelChange(e.target.value)}
          style={inputStyle}
        >
          {PROVIDER_MODELS[provider].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {!PROVIDER_MODELS[provider].includes(modelName) && modelName ? (
            <option value={modelName}>{modelName} (stored)</option>
          ) : null}
        </select>
      </label>

      <label style={labelStyle}>
        <span style={labelText}>
          Temperature: <strong>{temperature.toFixed(1)}</strong>
        </span>
        <input
          type="range"
          min={TEMP_MIN}
          max={TEMP_MAX}
          step={TEMP_STEP}
          value={temperature}
          onChange={(e) => onTemperatureChange(Number(e.target.value))}
          style={{ width: "100%" }}
          aria-label="Temperature"
          aria-valuemin={TEMP_MIN}
          aria-valuemax={TEMP_MAX}
          aria-valuenow={temperature}
        />
      </label>

      <label style={labelStyle}>
        <span style={labelText}>Max tokens</span>
        <input
          type="number"
          min={MAX_TOKENS_MIN}
          max={MAX_TOKENS_MAX}
          value={maxTokens}
          onChange={(e) => onMaxTokensChange(Number(e.target.value))}
          style={inputStyle}
        />
      </label>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: SPACING.xxs,
};
const labelText: React.CSSProperties = {
  fontSize: FONT.xs,
  fontWeight: FONT_WEIGHT.semibold,
  letterSpacing: LETTER_SPACING.tight,
  textTransform: "uppercase",
  color: "var(--ct-text-muted)",
};
const inputStyle: React.CSSProperties = {
  background: "var(--ct-surface-2)",
  border: "1px solid var(--ct-border)",
  borderRadius: RADIUS.md,
  padding: `${SPACING.s}px ${SPACING.md}px`,
  color: "var(--ct-text-primary)",
  fontSize: FONT.base,
  fontFamily: "inherit",
  outline: "none",
};
