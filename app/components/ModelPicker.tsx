"use client";

import React, { useState, useRef } from "react";
import { Cpu, ChevronDown } from "lucide-react";
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
            <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Uni Mode</span>
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
              <ModelSelect
                label={AGENT_LABELS.uni}
                value={config.uni}
                onChange={(v) => handleModelChange("uni", v)}
                models={GEMMA_MODELS}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <ModelSelect
                label={AGENT_LABELS.router}
                value={config.router}
                onChange={(v) => handleModelChange("router", v)}
                models={GEMMA_MODELS}
              />
              <ModelSelect
                label={AGENT_LABELS.selector}
                value={config.selector}
                onChange={(v) => handleModelChange("selector", v)}
                models={GEMMA_MODELS}
              />
              <ModelSelect
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

interface ModelSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  models: readonly { id: string; label: string }[];
}

function ModelSelect({ label, value, onChange, models }: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(!models.some(m => m.id === value));
  const selectRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = (e: MouseEvent) => {
    if (!selectRef.current?.contains(e.target as Node)) {
      setOpen(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectedModel = models.find(m => m.id === value);

  return (
    <div ref={selectRef} className="relative">
      <label className="text-[10px] font-medium uppercase tracking-wider mb-1.5 block" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-all"
        style={{
          background: open ? "var(--bg-tertiary)" : "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <span className="truncate">{customMode ? value : selectedModel?.label || value}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform flex-shrink-0 ml-2 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg border max-h-60 overflow-auto animate-scale-in"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            boxShadow: "var(--shadow-elevated)",
          }}
        >
          {/* Predefined models */}
          <div className="py-1">
            {models.map((model) => (
              <button
                key={model.id}
                onClick={() => {
                  onChange(model.id);
                  setCustomMode(false);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs transition-colors truncate"
                style={{
                  color: value === model.id ? "var(--accent-color)" : "var(--text-secondary)",
                  background: value === model.id ? "var(--accent-glow)" : "transparent",
                }}
              >
                {model.label}
              </button>
            ))}
          </div>

          {/* Custom option divider */}
          <div className="h-px my-1" style={{ background: "var(--border-color)" }} />

          {/* Custom model input */}
          <div className="p-2">
            <input
              type="text"
              value={customMode ? value : ""}
              onChange={(e) => {
                onChange(e.target.value);
                setCustomMode(true);
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Custom model ID..."
              className="w-full px-3 py-2 rounded-lg text-xs border outline-none font-mono"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
            <p className="text-[10px] mt-1.5 px-1" style={{ color: "var(--text-quaternary)" }}>
              e.g. anthropic/claude-3-5-sonnet
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
