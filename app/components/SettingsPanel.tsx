"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Eye, EyeOff, Trash2, Settings, Globe, AlertCircle, Key, Plus, Zap, Cpu, Server } from "lucide-react";
import {
  loadApiKeysState,
  setApiKey,
  addCustomEndpoint,
  removeCustomEndpoint,
  type ApiProvider,
  type ApiKeysState,
  type ApiKeyConfig,
  type CustomEndpoint,
  PROVIDER_INFO,
  LOCAL_PROVIDERS,
} from "../lib/apiKeys";

type TabId = "api-keys" | "local-models" | "custom-endpoints";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "api-keys", label: "API Keys", icon: <Key className="w-3 h-3" /> },
  { id: "local-models", label: "Local Models", icon: <Cpu className="w-3 h-3" /> },
  { id: "custom-endpoints", label: "Endpoints", icon: <Globe className="w-3 h-3" /> },
];

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [state, setState] = useState<ApiKeysState>(loadApiKeysState());
  const [activeTab, setActiveTab] = useState<TabId>("api-keys");
  const [visibleKeys, setVisibleKeys] = useState<Set<ApiProvider>>(new Set());
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState({
    name: "",
    endpoint: "",
    modelId: "",
    apiKey: "",
    provider: "openai" as CustomEndpoint["provider"],
  });

  const [localDrafts, setLocalDrafts] = useState<Record<string, { endpoint: string; modelId: string }>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (isOpen) {
      const loaded = loadApiKeysState();
      setState(loaded);
      setShowCustomForm(false);
      const drafts: Record<string, { endpoint: string; modelId: string }> = {};
      loaded.customEndpoints.forEach(ep => {
        drafts[ep.id] = { endpoint: ep.endpoint, modelId: ep.modelId || "" };
      });
      setLocalDrafts(drafts);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const toggleKeyVisibility = (provider: ApiProvider) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const handleSetKey = (provider: ApiProvider, key: string) => {
    const config: ApiKeyConfig | null = key ? { provider, key } : null;
    setState(setApiKey(provider, config));
  };

  const handleRemoveKey = (provider: ApiProvider) => {
    setState(setApiKey(provider, null));
  };

  const handleQuickAddLocal = (type: "lmstudio" | "ollama") => {
    const info = LOCAL_PROVIDERS[type];
    const newState = addCustomEndpoint({
      name: info.name,
      endpoint: info.defaultEndpoint,
      modelId: "",
      provider: type,
    });
    setState(newState);
    const newEp = newState.customEndpoints[newState.customEndpoints.length - 1];
    setLocalDrafts(prev => ({ ...prev, [newEp.id]: { endpoint: newEp.endpoint, modelId: "" } }));
    setTimeout(() => {
      inputRefs.current[`${newEp.id}-modelId`]?.focus();
    }, 50);
  };

  const handleLocalBlur = (epId: string) => {
    const draft = localDrafts[epId];
    if (!draft) return;
    const newState = loadApiKeysState();
    const idx = newState.customEndpoints.findIndex(e => e.id === epId);
    if (idx !== -1) {
      newState.customEndpoints[idx] = {
        ...newState.customEndpoints[idx],
        endpoint: draft.endpoint,
        modelId: draft.modelId,
      };
      localStorage.setItem("gemma-api-keys", JSON.stringify(newState));
      setState(newState);
    }
  };

  const handleLocalKeyDown = (e: React.KeyboardEvent, epId: string) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleAddCustom = () => {
    if (!customForm.name || !customForm.endpoint) return;
    setState(addCustomEndpoint({
      name: customForm.name,
      endpoint: customForm.endpoint,
      modelId: customForm.modelId || undefined,
      apiKey: customForm.apiKey || undefined,
      provider: customForm.provider,
    }));
    setCustomForm({ name: "", endpoint: "", modelId: "", apiKey: "", provider: "openai" });
    setShowCustomForm(false);
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 12))}${key.slice(-4)}`;
  };

  const cloudProviders: ApiProvider[] = [
    "openrouter", "deepseek", "openai", "gemini", "anthropic", "serper", "searxng",
  ];

  const localEndpoints = state.customEndpoints.filter(e => e.provider === "lmstudio" || e.provider === "ollama");
  const customEndpoints = state.customEndpoints.filter(e => e.provider !== "lmstudio" && e.provider !== "ollama");

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-[51] flex items-center justify-center p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div
          className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl flex flex-col animate-scale-in"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.3), 0 0 0 1px var(--border-color)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--border-color)" }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg"
                style={{ background: "var(--accent-glow)" }}>
                <Settings className="w-4 h-4" style={{ color: "var(--accent-color)" }} />
              </div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Settings</h2>
            </div>
            <button onClick={onClose}
              className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{ color: "var(--text-tertiary)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex px-5 pt-3 gap-1 flex-shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-all duration-200"
                style={{
                  background: activeTab === tab.id ? "var(--bg-tertiary)" : "transparent",
                  color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: activeTab === tab.id ? "inset 0 0 0 1px var(--border-color)" : "none",
                }}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            {/* Free tier notice */}
            <div className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
              style={{ background: "var(--accent-glow)", border: "1px solid rgba(136, 162, 184, 0.15)" }}>
              <Zap className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent-color)" }} />
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Free tier active. OpenRouter &amp; Serper keys are pre-configured — add your own below for other providers or local models.
              </p>
            </div>

            {/* ─── API Keys Tab ─────────────────────────────────────────── */}
            {activeTab === "api-keys" && (
              <section>
                <SectionLabel icon={<Key className="w-3 h-3" />}>Cloud Providers</SectionLabel>
                <div className="space-y-1.5">
                  {cloudProviders.map((provider) => {
                    const info = PROVIDER_INFO[provider];
                    const config = state.keys[provider];
                    const isVisible = visibleKeys.has(provider);

                    return (
                      <div key={provider} className="rounded-lg px-3 py-2.5"
                        style={{ background: config ? "var(--accent-glow)" : "var(--bg-tertiary)" }}>
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm">{info.icon}</span>
                          <span className="text-[11px] font-medium flex-1" style={{ color: "var(--text-primary)" }}>
                            {info.name}
                          </span>
                          {config ? (
                            <>
                              <code className="text-[10px] font-mono px-2 py-0.5 rounded"
                                style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
                                {isVisible ? config.key : maskKey(config.key)}
                              </code>
                              <button onClick={() => toggleKeyVisibility(provider)}
                                className="p-1 rounded transition-colors hover:bg-[var(--bg-secondary)]"
                                style={{ color: "var(--text-tertiary)" }}>
                                {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                              <button onClick={() => handleRemoveKey(provider)}
                                className="p-1 rounded transition-colors hover:bg-red-500/10 hover:text-red-400"
                                style={{ color: "var(--text-tertiary)" }}>
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <>
                              <input
                                type={isVisible ? "text" : "password"}
                                placeholder={info.placeholderKey}
                                onBlur={(e) => { if (e.target.value) handleSetKey(provider, e.target.value); }}
                                onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLInputElement).value) handleSetKey(provider, (e.target as HTMLInputElement).value); }}
                                className="w-40 rounded px-2 py-1 text-[10px] border outline-none font-mono focus:border-[var(--accent-color)]"
                                style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
                              />
                              <button onClick={() => toggleKeyVisibility(provider)}
                                className="p-1 rounded transition-colors hover:bg-[var(--bg-secondary)]"
                                style={{ color: "var(--text-tertiary)" }}>
                                {isVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ─── Local Models Tab ──────────────────────────────────────── */}
            {activeTab === "local-models" && (
              <section>
                <SectionLabel icon={<Cpu className="w-3 h-3" />}>Local Providers</SectionLabel>
                <div className="space-y-1.5">
                  {(["lmstudio", "ollama"] as const).map((type) => {
                    const info = LOCAL_PROVIDERS[type];
                    const eps = localEndpoints.filter(e => e.provider === type);

                    return (
                      <div key={type} className="rounded-lg px-3 py-2.5"
                        style={{ background: eps.length > 0 ? "var(--accent-glow)" : "var(--bg-tertiary)" }}>
                        <div className="flex items-center gap-2.5">
                          <span className="text-sm">{info.icon}</span>
                          <span className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
                            {info.name}
                          </span>
                          <span className="text-[10px] font-mono flex-1 text-right" style={{ color: "var(--text-tertiary)" }}>
                            {info.defaultEndpoint}
                          </span>
                          <button onClick={() => handleQuickAddLocal(type)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-all duration-200 active:scale-95"
                            style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}>
                            <Plus className="w-3 h-3" />
                            {eps.length > 0 ? "Add" : "Connect"}
                          </button>
                        </div>

                        {eps.length > 0 && (
                          <div className="mt-2 ml-7 space-y-1.5">
                            {eps.map(ep => {
                              const draft = localDrafts[ep.id] || { endpoint: ep.endpoint, modelId: ep.modelId || "" };
                              return (
                                <div key={ep.id} className="flex items-center gap-2 rounded-md px-2.5 py-2"
                                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
                                  <input
                                    ref={el => { inputRefs.current[`${ep.id}-modelId`] = el; }}
                                    type="text"
                                    value={draft.modelId}
                                    placeholder={info.placeholderModel}
                                    onChange={(e) => setLocalDrafts(prev => ({
                                      ...prev,
                                      [ep.id]: { ...prev[ep.id], modelId: e.target.value }
                                    }))}
                                    onBlur={() => handleLocalBlur(ep.id)}
                                    onKeyDown={(e) => handleLocalKeyDown(e, ep.id)}
                                    className="flex-1 text-[10px] font-mono outline-none bg-transparent"
                                    style={{ color: draft.modelId ? "var(--accent-color)" : "var(--text-quaternary)" }}
                                  />
                                  <span className="text-[9px]" style={{ color: "var(--text-quaternary)" }}>at</span>
                                  <input
                                    type="text"
                                    value={draft.endpoint}
                                    placeholder={info.defaultEndpoint}
                                    onChange={(e) => setLocalDrafts(prev => ({
                                      ...prev,
                                      [ep.id]: { ...prev[ep.id], endpoint: e.target.value }
                                    }))}
                                    onBlur={() => handleLocalBlur(ep.id)}
                                    onKeyDown={(e) => handleLocalKeyDown(e, ep.id)}
                                    className="w-36 text-[10px] font-mono outline-none bg-transparent text-right truncate"
                                    style={{ color: "var(--text-tertiary)" }}
                                  />
                                  <button onClick={() => setState(removeCustomEndpoint(ep.id))}
                                    className="p-0.5 rounded transition-colors hover:text-red-400 flex-shrink-0"
                                    style={{ color: "var(--text-quaternary)" }}>
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] mt-3 leading-snug" style={{ color: "var(--text-tertiary)" }}>
                  Models from LM Studio and Ollama appear here once connected. They&apos;ll also show in the model picker dropdown.
                </p>
              </section>
            )}

            {/* ─── Custom Endpoints Tab ─────────────────────────────────── */}
            {activeTab === "custom-endpoints" && (
              <section>
                <SectionLabel icon={<Globe className="w-3 h-3" />}>Custom Endpoints</SectionLabel>
                <div className="space-y-1.5">
                  {customEndpoints.map(ep => (
                    <div key={ep.id} className="rounded-lg px-3 py-2.5 flex items-center gap-2.5"
                      style={{ background: "var(--bg-tertiary)" }}>
                      <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-tertiary)" }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{ep.name}</span>
                          {ep.modelId && (
                            <code className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                              style={{ background: "var(--accent-glow)", color: "var(--accent-color)" }}>
                              {ep.modelId}
                            </code>
                          )}
                        </div>
                        <code className="text-[10px] font-mono truncate block" style={{ color: "var(--text-tertiary)" }}>
                          {ep.endpoint}
                        </code>
                      </div>
                      <button onClick={() => setState(removeCustomEndpoint(ep.id))}
                        className="p-1 rounded transition-colors hover:bg-red-500/10 hover:text-red-400 flex-shrink-0"
                        style={{ color: "var(--text-quaternary)" }}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {showCustomForm ? (
                    <div className="rounded-lg p-3 space-y-2"
                      style={{ background: "var(--bg-tertiary)", border: "1px solid var(--accent-color)" }}>
                      <div className="flex gap-2">
                        <input type="text" placeholder="Name" value={customForm.name}
                          onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                          className="flex-1 rounded px-2.5 py-1.5 text-[11px] border outline-none focus:border-[var(--accent-color)]"
                          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                        <select value={customForm.provider}
                          onChange={(e) => setCustomForm({ ...customForm, provider: e.target.value as CustomEndpoint["provider"] })}
                          className="rounded px-2 py-1.5 text-[11px] border outline-none cursor-pointer"
                          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}>
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="custom">Other</option>
                        </select>
                      </div>
                      <input type="text" placeholder="Endpoint URL" value={customForm.endpoint}
                        onChange={(e) => setCustomForm({ ...customForm, endpoint: e.target.value })}
                        className="w-full rounded px-2.5 py-1.5 text-[11px] border outline-none font-mono focus:border-[var(--accent-color)]"
                        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                      <input type="text" placeholder="Model ID (e.g. gpt-4)" value={customForm.modelId}
                        onChange={(e) => setCustomForm({ ...customForm, modelId: e.target.value })}
                        className="w-full rounded px-2.5 py-1.5 text-[11px] border outline-none font-mono focus:border-[var(--accent-color)]"
                        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                      <input type="password" placeholder="API Key (optional)" value={customForm.apiKey}
                        onChange={(e) => setCustomForm({ ...customForm, apiKey: e.target.value })}
                        className="w-full rounded px-2.5 py-1.5 text-[11px] border outline-none font-mono focus:border-[var(--accent-color)]"
                        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                      <div className="flex gap-2">
                        <button onClick={handleAddCustom}
                          disabled={!customForm.name || !customForm.endpoint}
                          className="flex-1 rounded px-3 py-1.5 text-[11px] font-medium disabled:opacity-40"
                          style={{ background: "var(--accent-color)", color: "#fff" }}>
                          Add
                        </button>
                        <button onClick={() => setShowCustomForm(false)}
                          className="rounded px-3 py-1.5 text-[11px]"
                          style={{ color: "var(--text-tertiary)" }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowCustomForm(true)}
                      className="w-full rounded-lg px-3 py-2.5 flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors"
                      style={{ color: "var(--text-tertiary)", border: "1px dashed var(--border-color)" }}>
                      <Plus className="w-3 h-3" />
                      Add endpoint
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* Footer */}
            <div className="flex items-center gap-2 px-1 pb-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" style={{ color: "var(--text-quaternary)" }} />
              <p className="text-[10px]" style={{ color: "var(--text-quaternary)" }}>
                Stored in localStorage. Never sent to any server.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span style={{ color: "var(--text-tertiary)" }}>{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
        {children}
      </span>
    </div>
  );
}
