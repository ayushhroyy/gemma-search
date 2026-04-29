"use client";

import React from "react";
import { Plus, Sun, Moon, Settings } from "lucide-react";
import { ModelPicker } from "./ModelPicker";
import type { ModelConfig, LocalModel } from "../lib/types";

interface HeaderProps {
  isDark: boolean;
  onToggleTheme: () => void;
  mounted: boolean;
  isChatMode?: boolean;
  onNewChat?: () => void;
  modelConfig: ModelConfig;
  onModelChange: (c: ModelConfig) => void;
  localModels?: LocalModel[];
  onShowSettings: () => void;
}

export function Header({
  isDark,
  onToggleTheme,
  mounted,
  isChatMode = false,
  onNewChat,
  modelConfig,
  onModelChange,
  localModels,
  onShowSettings,
}: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-20 px-3 sm:px-6 py-3 sm:py-4" style={{ background: "transparent" }}>
      <div className="flex items-center justify-between max-w-screen-xl mx-auto">
        <div className="flex items-center gap-2">
          {isChatMode && onNewChat && (
            <button
              onClick={onNewChat}
              className="group flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200 active:scale-95"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                boxShadow: "var(--shadow-subtle)",
                border: "1px solid var(--border-color)",
              }}
            >
              <Plus className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" />
              <span className="hidden sm:inline">New chat</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ModelPicker
            config={modelConfig}
            onChange={onModelChange}
            localModels={localModels}
          />
          <button
            onClick={onShowSettings}
            className="group rounded-xl p-2 transition-all duration-200 active:scale-90"
            style={{
              color: "var(--text-tertiary)",
            }}
            aria-label="Settings"
          >
            <Settings className="h-[18px] w-[18px] transition-all duration-300 group-hover:rotate-45" style={{ color: "var(--text-tertiary)" }} />
          </button>
          <button
            onClick={onToggleTheme}
            className="rounded-xl p-2 transition-all duration-200 active:scale-90"
            style={{ color: "var(--text-tertiary)" }}
            aria-label="Toggle theme"
          >
            {mounted ? (
              isDark ? (
                <Sun className="h-[18px] w-[18px]" />
              ) : (
                <Moon className="h-[18px] w-[18px]" />
              )
            ) : (
              <Sun className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
