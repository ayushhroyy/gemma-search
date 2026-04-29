"use client";

import React, { useState, useEffect, useRef } from "react";
import { Cpu, ChevronDown, Check, Pencil } from "lucide-react";
import { GEMMA_MODELS, type ModelConfig, type LocalModel } from "../lib/types";
import { loadApiKeysState, type CustomEndpoint } from "../lib/apiKeys";

const AGENT_LABELS: Record<"router" | "selector" | "writer", string> = {
  router:   "Router",
  selector: "Selector",
  writer:   "Writer",
};

export function ModelPicker({
  config,
  onChange,
  localModels = [],
}: {
  config: ModelConfig;
  onChange: (c: ModelConfig) => void;
  localModels?: LocalModel[];
}) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleUniMode = () => onChange({ ...config, uniMode: !config.uniMode });
  const isCustom = (id: string) =>
    !GEMMA_MODELS.some(m => m.id === id) &&
    !localModels.some(m => m.id === id);

  // Load configured custom endpoints as model options
  const configuredEndpoints: CustomEndpoint[] = typeof window !== "undefined"
    ? loadApiKeysState().customEndpoints
    : [];
  const endpointModels = configuredEndpoints
    .filter(e => e.modelId)
    .map(e => ({
      id: `${e.provider}/${e.modelId}`,
      label: `${e.name}: ${e.modelId}`,
    }));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] font-medium transition-all duration-200 active:scale-95"
        style={{
          backgroundColor: open ? "var(--bg-tertiary)" : "var(--bg-secondary)",
          color: "var(--text-secondary)",
          boxShadow: "var(--shadow-subtle)",
          border: "1px solid var(--border-color)",
        }}
        aria-label="Select agent models"
      >
        <Cpu className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
        <span className="hidden sm:inline">{config.uniMode ? "Uni" : "Models"}</span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 rounded-xl border p-3.5 z-50 animate-scale-in"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.2), 0 0 0 1px var(--border-color)",
          }}
        >
          {/* Uni Mode Toggle */}
          <div className="flex items-center justify-between mb-3 pb-3"
            style={{ borderBottom: "1px solid var(--border-color)" }}>
            <div>
              <p className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Uni Mode</p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                One model handles everything
              </p>
            </div>
            <button
              onClick={toggleUniMode}
              className="relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200"
              style={{
                backgroundColor: config.uniMode ? "var(--accent-color)" : "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
              }}
              aria-pressed={config.uniMode}
              aria-label="Toggle Uni Mode"
            >
              <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{ transform: config.uniMode ? "translateX(16px)" : "translateX(0px)" }} />
            </button>
          </div>

          <div className="mb-3">
            <button
              onClick={() => setShowCustom(!showCustom)}
              className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors"
              style={{ color: showCustom ? "var(--accent-color)" : "var(--text-tertiary)" }}
            >
              {showCustom ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              <span>{showCustom ? "Done" : "Custom"}</span>
            </button>
          </div>

          {config.uniMode ? (
            <div>
              {showCustom ? (
                <input type="text" value={config.uni}
                  onChange={(e) => onChange({ ...config, uni: e.target.value })}
                  placeholder="provider/model-id"
                  className="w-full rounded-lg px-2.5 py-1.5 text-[11px] border outline-none font-mono"
                  style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--accent-color)" }} />
              ) : (
                <select value={isCustom(config.uni) ? "custom" : config.uni}
                  onChange={(e) => {
                    if (e.target.value === "custom") setShowCustom(true);
                    else onChange({ ...config, uni: e.target.value });
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-[11px] border appearance-none cursor-pointer outline-none"
                  style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}>
                  <optgroup label="Cloud Models">
                    {GEMMA_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </optgroup>
                  {localModels.length > 0 && (
                    <optgroup label="Auto-detected">
                      {localModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {endpointModels.length > 0 && (
                    <optgroup label="Configured Endpoints">
                      {endpointModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </optgroup>
                  )}
                  <option value="custom">Custom...</option>
                </select>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {(Object.keys(AGENT_LABELS) as ("router" | "selector" | "writer")[]).map((agent) => (
                <div key={agent} className="flex items-center gap-2">
                  <span className="text-[10px] font-medium w-14 flex-shrink-0"
                    style={{ color: "var(--text-tertiary)" }}>{AGENT_LABELS[agent]}</span>
                  {showCustom ? (
                    <input type="text" value={config[agent]}
                      onChange={(e) => onChange({ ...config, [agent]: e.target.value })}
                      placeholder="provider/model-id"
                      className="flex-1 rounded-lg px-2.5 py-1.5 text-[11px] border outline-none font-mono"
                      style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--accent-color)" }} />
                  ) : (
                    <select value={isCustom(config[agent]) ? "custom" : config[agent]}
                      onChange={(e) => {
                        if (e.target.value === "custom") setShowCustom(true);
                        else onChange({ ...config, [agent]: e.target.value });
                      }}
                      className="flex-1 rounded-lg px-2.5 py-1.5 text-[11px] border appearance-none cursor-pointer outline-none"
                      style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}>
                      <optgroup label="Cloud Models">
                        {GEMMA_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </optgroup>
                      {localModels.length > 0 && (
                        <optgroup label="Auto-detected">
                          {localModels.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </optgroup>
                      )}
                      {endpointModels.length > 0 && (
                        <optgroup label="Configured Endpoints">
                          {endpointModels.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </optgroup>
                      )}
                      <option value="custom">Custom...</option>
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] mt-3 leading-snug" style={{ color: "var(--text-tertiary)" }}>
            {showCustom
              ? "e.g. ollama/llama3, anthropic/claude-3-opus"
              : localModels.length > 0
                ? `${localModels.length} local model${localModels.length > 1 ? "s" : ""} detected`
                : "Free tier via OpenRouter"}
          </p>
        </div>
      )}
    </div>
  );
}
