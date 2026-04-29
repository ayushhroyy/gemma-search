"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { GEMMA_MODELS, type ModelConfig } from "../lib/types";

const MODELS = GEMMA_MODELS;

interface ModelPickerProps {
  config: ModelConfig;
  onChange: (config: ModelConfig) => void;
}

export function ModelPicker({ config, onChange }: ModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedModel = MODELS.find(m => m.id === config.uni) || null;

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (modelId: string) => {
    onChange({ ...config, uni: modelId, uniMode: true });
    setIsOpen(false);
    setSearchQuery("");
  };

  const filteredModels = MODELS.filter(m =>
    m.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const dropdown = (
    <div
      ref={dropdownRef}
      className="z-50 rounded-lg border shadow-lg animate-fade-in"
      style={{
        position: "fixed",
        width: "280px",
        maxHeight: "300px",
        overflow: "hidden",
        background: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      }}
    >
      {/* Search */}
      <div className="border-b px-3 py-2" style={{ borderColor: "var(--border-color)" }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search models..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-transparent text-xs outline-none placeholder:opacity-50"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {/* Model List */}
      <div className="overflow-y-auto" style={{ maxHeight: "250px" }}>
        {filteredModels.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              No models found
            </p>
          </div>
        ) : (
          filteredModels.map((model) => {
            const isSelected = config.uni === model.id;
            return (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors"
                style={{
                  background: isSelected ? "var(--bg-tertiary)" : "transparent",
                  color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "var(--bg-tertiary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <span className="text-xs truncate">{model.label}</span>
                {isSelected && <Check className="w-3 h-3 shrink-0" style={{ color: "var(--accent-color)" }} />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors"
        style={{
          background: "var(--bg-tertiary)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-color)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--text-tertiary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-color)";
        }}
      >
        <span className="truncate max-w-[120px]">
          {selectedModel?.label || "Select model"}
        </span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}
