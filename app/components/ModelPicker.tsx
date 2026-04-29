"use client";

import React, { useState, useRef } from "react";
import { Cpu, ChevronDown, Sparkles } from "lucide-react";
import { GEMMA_MODELS, type ModelConfig } from "../lib/types";

const AGENT_LABELS: Record<"router" | "selector" | "writer" | "uni", string> = {
  router:   "Router",
  selector: "Selector",
  writer:   "Writer",
  uni:      "Model",
};

export function ModelPicker({
  config,
  onChange,
}: {
  config: ModelConfig;
  onChange: (c: ModelConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = (e: MouseEvent) => {
    if (
      !triggerRef.current?.contains(e.target as Node) &&
      !dropdownRef.current?.contains(e.target as Node)
    ) {
      setOpen(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const toggleUniMode = () => onChange({ ...config, uniMode: !config.uniMode });

  const handleModelChange = (key: keyof ModelConfig, value: string) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
        style={{
          background: open ? "var(--bg-tertiary)" : "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-secondary)",
        }}
      >
        <Cpu className="w-3.5 h-3.5" style={{ color: "var(--accent-color)" }} />
        <span>Models</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute top-full right-0 mt-2 w-72 rounded-xl border p-4 z-50 animate-scale-in"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            boxShadow: "var(--shadow-elevated)",
          }}
        >
          {/* Uni Mode Toggle */}
          <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: "1px solid var(--border-color)" }}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--accent-color)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Uni Mode</span>
            </div>
            <button
              onClick={toggleUniMode}
              className="relative w-9 h-5 rounded-full transition-colors duration-200"
              style={{
                background: config.uniMode ? "var(--accent-color)" : "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{ transform: config.uniMode ? "translateX(16px)" : "translateX(0)" }}
              />
            </button>
          </div>

          {/* Model Selects */}
          {config.uniMode ? (
            <div>
              <NativeSelect
                label={AGENT_LABELS.uni}
                value={config.uni}
                onChange={(v) => handleModelChange("uni", v)}
                models={GEMMA_MODELS}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <NativeSelect
                label={AGENT_LABELS.router}
                value={config.router}
                onChange={(v) => handleModelChange("router", v)}
                models={GEMMA_MODELS}
              />
              <NativeSelect
                label={AGENT_LABELS.selector}
                value={config.selector}
                onChange={(v) => handleModelChange("selector", v)}
                models={GEMMA_MODELS}
              />
              <NativeSelect
                label={AGENT_LABELS.writer}
                value={config.writer}
                onChange={(v) => handleModelChange("writer", v)}
                models={GEMMA_MODELS}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface NativeSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  models: readonly { id: string; label: string }[];
}

function NativeSelect({ label, value, onChange, models }: NativeSelectProps) {
  const isCustom = !models.some(m => m.id === value);

  return (
    <div>
      <label className="text-[10px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </label>
      <select
        value={isCustom ? "__custom__" : value}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            // Focus the custom input
            const customInput = document.querySelector(`[data-custom-input="${label}"]`) as HTMLInputElement;
            customInput?.focus();
          } else {
            onChange(e.target.value);
          }
        }}
        className="w-full px-3 py-2 rounded-lg text-xs appearance-none cursor-pointer outline-none transition-all"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a3a3a3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
          backgroundSize: "14px",
          paddingRight: "32px",
        }}
      >
        <optgroup label="Popular Models">
          {models.map((model) => (
            <option key={model.id} value={model.id}>{model.label}</option>
          ))}
        </optgroup>
        <option value="__custom__">Custom model ID...</option>
      </select>
      {isCustom && (
        <input
          type="text"
          data-custom-input={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. anthropic/claude-3-5-sonnet"
          className="w-full mt-2 px-3 py-2 rounded-lg text-xs border outline-none font-mono"
          style={{
            background: "var(--bg-tertiary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        />
      )}
    </div>
  );
}
