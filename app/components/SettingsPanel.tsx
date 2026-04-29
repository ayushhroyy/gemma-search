"use client";

import React, { useState, useEffect } from "react";
import { X, Eye, EyeOff, Trash2, Settings, Plus, Globe, Key, Check } from "lucide-react";
import {
  loadApiKeysState,
  setApiKey,
  addCustomEndpoint,
  removeCustomEndpoint,
  type ApiKeysState,
  type ApiKeyConfig,
  saveApiKeysState,
} from "../lib/apiKeys";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [state, setState] = useState<ApiKeysState>(loadApiKeysState());
  const [showKey, setShowKey] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState({
    name: "",
    endpoint: "",
    apiKey: "",
  });

  useEffect(() => {
    if (isOpen) {
      setState(loadApiKeysState());
      setShowCustomForm(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleSetMainKey = (key: string) => {
    const newState = setApiKey("openrouter", key ? { provider: "openrouter", key } : null);
    setState(newState);
  };

  const handleSetSearchKey = (key: string) => {
    const newState = setApiKey("serper", key ? { provider: "serper", key } : null);
    setState(newState);
  };

  const handleAddCustom = () => {
    if (!customForm.name || !customForm.endpoint) return;
    setState(addCustomEndpoint({
      name: customForm.name,
      endpoint: customForm.endpoint,
      apiKey: customForm.apiKey || undefined,
      provider: "custom",
    }));
    setCustomForm({ name: "", endpoint: "", apiKey: "" });
    setShowCustomForm(false);
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 12))}${key.slice(-4)}`;
  };

  if (!isOpen) return null;

  const mainKey = state.keys.openrouter;
  const searchKey = state.keys.serper;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-[51] flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-md overflow-hidden rounded-2xl flex flex-col animate-scale-in"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "var(--border-color)" }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl"
                style={{ background: "var(--accent-glow)", border: "1px solid var(--border-color)" }}>
                <Settings className="w-4 h-4" style={{ color: "var(--accent-color)" }} />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Settings</h2>
                <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Configure your API keys</p>
              </div>
            </div>
            <button onClick={onClose}
              className="rounded-lg p-2 transition-all hover:scale-105 active:scale-95"
              style={{ color: "var(--text-tertiary)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-5 space-y-6 overflow-y-auto max-h-[70vh]">
            {/* Main API Key */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                <Key className="w-3.5 h-3.5" />
                OpenRouter API Key
              </label>
              {mainKey ? (
                <div className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
                  <code className="flex-1 text-xs font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                    {showKey ? mainKey.key : maskKey(mainKey.key)}
                  </code>
                  <button onClick={() => setShowKey(!showKey)}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-secondary)]"
                    style={{ color: "var(--text-tertiary)" }}>
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => handleSetMainKey("")}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                    style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="sk-or-v1-..."
                  onBlur={(e) => { if (e.target.value) handleSetMainKey(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value) handleSetMainKey(e.currentTarget.value); }}
                  className="w-full rounded-xl px-4 py-3 text-sm border outline-none font-mono transition-all focus:ring-2 focus:ring-[var(--accent-color)]/20"
                  style={{ background: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
                />
              )}
              <p className="text-[10px]" style={{ color: "var(--text-quaternary)" }}>
                Used for all models by default. Get one at <a href="https://openrouter.ai" target="_blank" rel="noopener" className="underline" style={{ color: "var(--accent-color)" }}>openrouter.ai</a>
              </p>
            </div>

            {/* Search API Key */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                <Globe className="w-3.5 h-3.5" />
                Serper Search Key
              </label>
              {searchKey ? (
                <div className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
                  <code className="flex-1 text-xs font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                    {showKey ? searchKey.key : maskKey(searchKey.key)}
                  </code>
                  <button onClick={() => handleSetMainKey("")}
                    className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                    style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Your Serper API key"
                  onBlur={(e) => { if (e.target.value) handleSetSearchKey(e.target.value); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value) handleSetSearchKey(e.currentTarget.value); }}
                  className="w-full rounded-xl px-4 py-3 text-sm border outline-none font-mono transition-all focus:ring-2 focus:ring-[var(--accent-color)]/20"
                  style={{ background: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
                />
              )}
              <p className="text-[10px]" style={{ color: "var(--text-quaternary)" }}>
                For web search. Get one at <a href="https://serper.dev" target="_blank" rel="noopener" className="underline" style={{ color: "var(--accent-color)" }}>serper.dev</a>
              </p>
            </div>

            {/* Divider */}
            <div className="h-px" style={{ background: "var(--border-color)" }} />

            {/* Custom Endpoints */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  <Globe className="w-3.5 h-3.5" />
                  Custom Endpoints
                </label>
              </div>

              <div className="space-y-2">
                {state.customEndpoints.map(ep => (
                  <div key={ep.id} className="rounded-xl px-4 py-3 flex items-center gap-3"
                    style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{ep.name}</p>
                      <code className="text-[10px] font-mono truncate block" style={{ color: "var(--text-tertiary)" }}>
                        {ep.endpoint}
                      </code>
                    </div>
                    <button onClick={() => setState(removeCustomEndpoint(ep.id))}
                      className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10 flex-shrink-0"
                      style={{ color: "var(--text-quaternary)" }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {showCustomForm ? (
                <div className="rounded-xl p-4 space-y-3"
                  style={{ background: "var(--bg-tertiary)", border: "2px solid var(--accent-color)" }}>
                  <input type="text" placeholder="Name (e.g. Local Ollama)" value={customForm.name}
                    onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm border outline-none"
                    style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                  <input type="text" placeholder="Endpoint URL" value={customForm.endpoint}
                    onChange={(e) => setCustomForm({ ...customForm, endpoint: e.target.value })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm border outline-none font-mono"
                    style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                  <input type="password" placeholder="API Key (optional)" value={customForm.apiKey}
                    onChange={(e) => setCustomForm({ ...customForm, apiKey: e.target.value })}
                    className="w-full rounded-lg px-3 py-2.5 text-sm border outline-none font-mono"
                    style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                  <div className="flex gap-2">
                    <button onClick={handleAddCustom}
                      disabled={!customForm.name || !customForm.endpoint}
                      className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-40 transition-all active:scale-[0.98]"
                      style={{ background: "var(--accent-color)", color: "#fff" }}>
                      <Check className="w-4 h-4 inline mr-1" /> Add
                    </button>
                    <button onClick={() => setShowCustomForm(false)}
                      className="rounded-lg px-4 py-2.5 text-sm transition-colors"
                      style={{ color: "var(--text-tertiary)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowCustomForm(true)}
                  className="w-full rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{ color: "var(--text-tertiary)", border: "2px dashed var(--border-color)", background: "transparent" }}>
                  <Plus className="w-4 h-4" />
                  Add custom endpoint
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t" style={{ borderColor: "var(--border-color)" }}>
            <p className="text-[10px] text-center" style={{ color: "var(--text-quaternary)" }}>
              Keys stored in browser. Never sent to our servers.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
