import { useEffect, useState } from "react";
import { islandInputStyle } from "../islandUi.js";
import { islandTheme } from "../theme.js";
import { apiFetch } from "../api/client.js";

type AiModel = { id: string; label: string };

type AiModelsResponse = {
  provider: string;
  models: AiModel[];
  error?: string;
};

const CUSTOM_VALUE = "__custom__";

export function AiModelSelect({
  value,
  provider,
  onChange,
  disabled
}: {
  value: string;
  provider: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    apiFetch(`/settings/ai-models?provider=${encodeURIComponent(provider)}`)
      .then((res) => res.json())
      .then((data: AiModelsResponse) => {
        if (cancelled) return;
        setModels(Array.isArray(data.models) ? data.models : []);
        setFetchError(data.error ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setModels([]);
        setFetchError(e instanceof Error ? e.message : "Failed to load models");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const inList = models.some((m) => m.id === value);
  // No usable list (loading done, empty or errored): fall back to plain text input.
  const noList = !loading && models.length === 0;
  const showCustom = noList || !inList;

  const selectValue = showCustom ? CUSTOM_VALUE : value;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {!noList && (
        <select
          value={selectValue}
          disabled={disabled || loading}
          onChange={(e) => {
            const next = e.target.value;
            if (next === CUSTOM_VALUE) {
              // Switching to custom: clear so the text box starts empty unless a value exists.
              if (inList) onChange("");
            } else {
              onChange(next);
            }
          }}
          style={{ ...islandInputStyle, width: "100%" }}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
          <option value={CUSTOM_VALUE}>Custom id…</option>
        </select>
      )}

      {showCustom && (
        <input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter a model id…"
          style={islandInputStyle}
          spellCheck={false}
        />
      )}

      {loading && (
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>loading models…</span>
      )}
      {!loading && fetchError && (
        <span style={{ fontSize: 12, color: islandTheme.color.textMuted }}>
          Couldn't load model list ({fetchError}) — enter a model id manually.
        </span>
      )}
    </div>
  );
}
