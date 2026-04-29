"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Cpu, ChevronDown, Check, Pencil, Sparkles } from "lucide-react";
import { GEMMA_MODELS, type ModelConfig } from "../lib/types";

const AGENT_LABELS: Record<"router" | "selector" | "writer", string> = {
  router:   "Router",
  selector: "Selector",
  writer:   "Writer",
};

export function ModelPicker({
  config,
  onChange,
}: {
  config: ModelConfig;
  onChange: (c: ModelConfig) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownWidth = Math.max(280, Math.min(340, window.innerWidth * 0.9));
      const padding = 12;

      let left = rect.left + (rect.width / 2) - (dropdownWidth / 2);
      if (left < padding) left = padding;
      if (left + dropdownWidth > window.innerWidth - padding) {
        left = window.innerWidth - dropdownWidth - padding;
      }

      setPosition({ top: rect.bottom + 8, left });
    }
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
        setShowCustom(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open) updatePosition();
    setOpen(!open);
  };

  const toggleUniMode = () => onChange({ ...config, uniMode: !config.uniMode });

  const handleModelChange = (agent: keyof ModelConfig, value: string) => {
    onChange({ ...config, [agent]: value });
  };

  const quickModels = GEMMA_MODELS.slice(0, 8);

  const dropdown = (
    <div
      ref={dropdownRef}
      className="z-[100] rounded-2xl border p-4 animate-scale-in"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        transformOrigin: "top",
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        width: "max(280px, min(340px, 90vw))",
        maxHeight: "calc(100dvh - 80px)",
        overflowY: "auto",
      }}
    >
      {/* Uni Mode Toggle */}
      <div className="flex items-center justify-between mb-4 pb-3"
        style={{ borderBottom: "1px solid var(--border-color)" }}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg"
            style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Uni Mode</p>
            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>One model for all</p>
          </div>
        </div>
        <button
          onClick={toggleUniMode}
          className="relative flex-shrink-0 w-10 h-5 rounded-full transition-all duration-200"
          style={{
            background: config.uniMode
              ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              : "var(--bg-tertiary)",
            border: "1px solid var(--border-color)",
          }}
        >
          <span
            className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
            style={{ transform: config.uniMode ? "translateX(20px)" : "translateX(0)" }}
          />
        </button>
      </div>

      {/* Mode Toggle */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className="w-full flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 mb-4 text-xs font-medium transition-all"
        style={{
          background: showCustom ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "var(--bg-tertiary)",
          color: showCustom ? "#fff" : "var(--text-secondary)",
        }}
      >
        {showCustom ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
        {showCustom ? "Quick Select" : "Custom Model"}
      </button>

      {config.uniMode ? (
        showCustom ? (
          <CustomModelInput
            value={config.uni}
            onChange={(v) => handleModelChange("uni", v)}
            placeholder="Enter any model ID..."
          />
        ) : (
          <QuickModelList
            selected={config.uni}
            onSelect={(v) => handleModelChange("uni", v)}
            models={quickModels}
          />
        )
      ) : (
        <div className="space-y-3">
          {(Object.keys(AGENT_LABELS) as ("router" | "selector" | "writer")[]).map((agent) => (
            <div key={agent}>
              <label className="text-[10px] font-medium uppercase tracking-wider mb-1.5 block"
                style={{ color: "var(--text-tertiary)" }}>
                {AGENT_LABELS[agent]}
              </label>
              {showCustom ? (
                <CustomModelInput
                  value={config[agent]}
                  onChange={(v) => handleModelChange(agent, v)}
                  placeholder="Enter any model ID..."
                />
              ) : (
                <QuickModelList
                  selected={config[agent]}
                  onSelect={(v) => handleModelChange(agent, v)}
                  models={quickModels}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] mt-4 pt-3 text-center leading-snug"
        style={{ color: "var(--text-quaternary)", borderTop: "1px solid var(--border-color)" }}>
        {showCustom
          ? "Type any model ID: google/gemma-4, anthropic/claude-3-5-sonnet, etc."
          : "All models served via OpenRouter"}
      </p>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={toggleOpen}
        className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-95"
        style={{
          background: open ? "var(--bg-tertiary)" : "var(--bg-secondary)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <Cpu className="h-3.5 w-3.5" style={{ color: "var(--accent-color)" }} />
        <span>{config.uniMode ? "Uni" : "Models"}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}

function CustomModelInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3 py-2.5 text-sm border outline-none font-mono transition-all focus:ring-2 focus:ring-[var(--accent-color)]/20"
      style={{ background: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
    />
  );
}

function QuickModelList({
  selected,
  onSelect,
  models,
}: {
  selected: string;
  onSelect: (v: string) => void;
  models: readonly { id: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      {models.map((model) => {
        const isSelected = selected === model.id;
        return (
          <button
            key={model.id}
            onClick={() => onSelect(model.id)}
            className="w-full text-left rounded-lg px-3 py-2 text-xs transition-all"
            style={{
              background: isSelected ? "linear-gradient(135deg, #667eea15 0%, #764ba215 100%)" : "transparent",
              color: isSelected ? "var(--accent-color)" : "var(--text-secondary)",
              border: isSelected ? "1px solid var(--accent-color)" : "1px solid transparent",
            }}
          >
            {model.label}
          </button>
        );
      })}
    </div>
  );
}
