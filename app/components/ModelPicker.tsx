"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  const [position, setPosition] = useState<{ top: number; left: number | "auto"; right: number | "auto" }>({
    top: 0,
    left: 0,
    right: "auto",
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const dropdownWidth = Math.max(288, Math.min(360, window.innerWidth * 0.9));
      const padding = 12;

      let left = rect.left + (rect.width / 2) - (dropdownWidth / 2);
      
      // Clamp to screen edges
      if (left < padding) left = padding;
      if (left + dropdownWidth > window.innerWidth - padding) {
        left = window.innerWidth - dropdownWidth - padding;
      }

      setPosition({
        top: rect.bottom + 8,
        left: left,
        right: "auto",
      });
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
    if (!open) {
      updatePosition();
    }
    setOpen(!open);
  };

  const toggleUniMode = () => onChange({ ...config, uniMode: !config.uniMode });
  const isCustom = (id: string) =>
    !GEMMA_MODELS.some(m => m.id === id) &&
    !localModels.some(m => m.id === id);

  const configuredEndpoints: CustomEndpoint[] = typeof window !== "undefined"
    ? loadApiKeysState().customEndpoints
    : [];
  const endpointModels = configuredEndpoints
    .filter(e => e.modelId)
    .map(e => ({
      id: `${e.provider}/${e.modelId}`,
      label: `${e.name}: ${e.modelId}`,
    }));

  const selectOptions = (
    <>
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
        <optgroup label="Configured">
          {endpointModels.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </optgroup>
      )}
      <option value="custom">Custom...</option>
    </>
  );

  const dropdown = (
    <div
      ref={dropdownRef}
      className="z-[100] rounded-xl border p-3.5 animate-scale-in"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: position.left === "auto" ? "auto" : `${position.left}px`,
        right: position.right === "auto" ? "auto" : `${position.right}px`,
        transformOrigin: "top",
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.2), 0 0 0 1px var(--border-color)",
        width: "max(288px, min(360px, 90vw))",
        maxHeight: "calc(100dvh - 80px)",
        overflowY: "auto",
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
              {selectOptions}
            </select>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {(Object.keys(AGENT_LABELS) as ("router" | "selector" | "writer")[]).map((agent) => (
            <div key={agent}>
              <span className="text-[10px] font-medium block mb-1"
                style={{ color: "var(--text-tertiary)" }}>{AGENT_LABELS[agent]}</span>
              {showCustom ? (
                <input type="text" value={config[agent]}
                  onChange={(e) => onChange({ ...config, [agent]: e.target.value })}
                  placeholder="provider/model-id"
                  className="w-full rounded-lg px-2.5 py-1.5 text-[11px] border outline-none font-mono"
                  style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--accent-color)" }} />
              ) : (
                <select value={isCustom(config[agent]) ? "custom" : config[agent]}
                  onChange={(e) => {
                    if (e.target.value === "custom") setShowCustom(true);
                    else onChange({ ...config, [agent]: e.target.value });
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-[11px] border appearance-none cursor-pointer outline-none"
                  style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}>
                  {selectOptions}
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
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={toggleOpen}
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

      {open && typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}
