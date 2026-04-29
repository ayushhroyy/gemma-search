"use client";

import React, { useState, useEffect } from "react";
import { X, Eye, EyeOff, Trash2, Check, Settings, Globe, AlertCircle, Key, Plus, Zap, Server, Cpu } from "lucide-react";
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

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "providers" | "local" | "endpoints";

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [state, setState] = useState<ApiKeysState>(loadApiKeysState());
  const [visibleKeys, setVisibleKeys] = useState<Set<ApiProvider>>(new Set());
  const [activeTab, setActiveTab] = useState<Tab>("providers");
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState({
    name: "",
    endpoint: "",
    modelId: "",
    apiKey: "",
    provider: "openai" as CustomEndpoint["provider"],
  });

  useEffect(() => {
    if (isOpen) {
      setState(loadApiKeysState());
      setActiveTab("providers");
      setShowAddEndpoint(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const handleSetKey = (provider: ApiProvider, key: string) => {
    const config: ApiKeyConfig | null = key ? { provider, key } : null;
    setState(setApiKey(provider, config));
  };

  const toggleKeyVisibility = (provider: ApiProvider) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const handleAddEndpoint = () => {
    if (!newEndpoint.name || !newEndpoint.endpoint) return;
    setState(addCustomEndpoint({
      name: newEndpoint.name,
      endpoint: newEndpoint.endpoint,
      modelId: newEndpoint.modelId || undefined,
      apiKey: newEndpoint.apiKey || undefined,
      provider: newEndpoint.provider,
    }));
    setNewEndpoint({ name: "", endpoint: "", modelId: "", apiKey: "", provider: "openai" });
    setShowAddEndpoint(false);
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 12))}${key.slice(-4)}`;
  };

  const providers: ApiProvider[] = [
    "openrouter", "deepseek", "openai", "gemini", "anthropic", "serper", "searxng",
  ];

  // Quick-setup for local providers
  const handleQuickAddLocal = (type: "lmstudio" | "ollama") => {
    const info = LOCAL_PROVIDERS[type];
    setState(addCustomEndpoint({
      name: info.name,
      endpoint: info.defaultEndpoint,
      modelId: "",
      provider: type,
    }));
  };

  // Get existing local endpoints
  const localEndpoints = state.customEndpoints.filter(e => e.provider === "lmstudio" || e.provider === "ollama");
  const remoteEndpoints = state.customEndpoints.filter(e => e.provider !== "lmstudio" && e.provider !== "ollama");

  if (!isOpen) return null;

  const activeKeyCount = Object.values(state.keys).filter(Boolean).length;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <div
          className="relative w-full max-w-xl max-h-[88vh] overflow-hidden rounded-2xl animate-scale-in"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.3), 0 0 0 1px var(--border-color)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border-color)" }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: "var(--accent-glow)" }}>
                <Settings className="w-4 h-4" style={{ color: "var(--accent-color)" }} />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Settings</h2>
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {activeKeyCount > 0
                    ? `${activeKeyCount} provider${activeKeyCount > 1 ? "s" : ""} configured`
                    : "Using default free tier"}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{ color: "var(--text-tertiary)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Default tier notice */}
          <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-lg px-3 py-2.5"
            style={{ background: "var(--accent-glow)", border: "1px solid rgba(136, 162, 184, 0.2)" }}>
            <Zap className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent-color)" }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Free tier active — OpenRouter &amp; Serper keys are pre-configured on the backend. Add your own keys or local models below.
            </p>
          </div>

          {/* Tab Bar */}
          <div className="flex gap-0.5 mx-5 mt-4 rounded-lg p-0.5" style={{ background: "var(--bg-tertiary)" }}>
            {([
              { key: "providers" as Tab, icon: <Key className="w-3 h-3" />, label: "API Keys" },
              { key: "local" as Tab, icon: <Cpu className="w-3 h-3" />, label: "Local Models" },
              { key: "endpoints" as Tab, icon: <Globe className="w-3 h-3" />, label: "Custom" },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-medium transition-all duration-200"
                style={{
                  backgroundColor: activeTab === tab.key ? "var(--bg-secondary)" : "transparent",
                  color: activeTab === tab.key ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: activeTab === tab.key ? "var(--shadow-subtle)" : "none",
                }}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(88vh - 260px)" }}>

            {/* ─── API Keys Tab ─────────────────────────────────────────────── */}
            {activeTab === "providers" && (
              <div className="space-y-2">
                {providers.map((provider) => {
                  const info = PROVIDER_INFO[provider];
                  const config = state.keys[provider];
                  const isVisible = visibleKeys.has(provider);

                  return (
                    <div key={provider}
                      className="rounded-xl p-3.5 transition-all duration-200"
                      style={{
                        background: config ? "var(--accent-glow)" : "var(--bg-tertiary)",
                        border: `1px solid ${config ? "rgba(136, 162, 184, 0.2)" : "var(--border-color)"}`,
                      }}>
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-base"
                          style={{ background: "var(--bg-secondary)" }}>
                          {info.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{info.name}</span>
                            {config && (
                              <span className="flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                                style={{ background: "var(--accent-color)", color: "#fff" }}>
                                <Check className="w-2.5 h-2.5" /> Active
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{info.description}</p>
                        </div>
                      </div>

                      {config ? (
                        <div className="flex items-center gap-1.5 mt-2.5 ml-11">
                          <code className="flex-1 text-[11px] px-2.5 py-1.5 rounded-md font-mono truncate"
                            style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                            {isVisible ? config.key : maskKey(config.key)}
                          </code>
                          <button onClick={() => toggleKeyVisibility(provider)}
                            className="rounded-md p-1.5 transition-colors hover:bg-[var(--bg-secondary)]"
                            style={{ color: "var(--text-tertiary)" }}>
                            {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => { setApiKey(provider, null); setState(loadApiKeysState()); }}
                            className="rounded-md p-1.5 transition-colors hover:bg-red-500/10 hover:text-red-400"
                            style={{ color: "var(--text-tertiary)" }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-2.5 ml-11">
                          <input
                            type={isVisible ? "text" : "password"}
                            placeholder={info.placeholderKey}
                            onChange={(e) => { if (e.target.value) handleSetKey(provider, e.target.value); }}
                            className="flex-1 rounded-md px-2.5 py-1.5 text-[11px] border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
                            style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
                          />
                          <button onClick={() => toggleKeyVisibility(provider)}
                            className="rounded-md p-1.5 transition-colors hover:bg-[var(--bg-secondary)]"
                            style={{ color: "var(--text-tertiary)" }}>
                            {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ─── Local Models Tab ──────────────────────────────────────────── */}
            {activeTab === "local" && (
              <div className="space-y-3">
                {/* Quick setup cards for LM Studio and Ollama */}
                {(["lmstudio", "ollama"] as const).map((type) => {
                  const info = LOCAL_PROVIDERS[type];
                  const existing = localEndpoints.filter(e => e.provider === type);

                  return (
                    <div key={type}
                      className="rounded-xl p-4 transition-all duration-200"
                      style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-base"
                            style={{ background: "var(--bg-secondary)" }}>
                            {info.icon}
                          </div>
                          <div>
                            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{info.name}</span>
                            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{info.description}</p>
                          </div>
                        </div>
                        {existing.length === 0 && (
                          <button onClick={() => handleQuickAddLocal(type)}
                            className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[10px] font-medium transition-all duration-200 active:scale-95"
                            style={{ background: "var(--accent-glow)", color: "var(--accent-color)", border: "1px solid rgba(136, 162, 184, 0.3)" }}>
                            <Plus className="w-3 h-3" />
                            Quick Add
                          </button>
                        )}
                      </div>

                      {/* Default endpoint hint */}
                      <div className="ml-11 mb-2">
                        <p className="text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                          Default: <span style={{ color: "var(--accent-color)" }}>{info.defaultEndpoint}</span>
                        </p>
                      </div>

                      {/* Existing endpoints for this provider */}
                      {existing.length > 0 && (
                        <div className="space-y-2 ml-11">
                          {existing.map((ep) => (
                            <LocalEndpointCard
                              key={ep.id}
                              endpoint={ep}
                              placeholderModel={info.placeholderModel}
                              onUpdate={(updated) => {
                                const newState = loadApiKeysState();
                                const idx = newState.customEndpoints.findIndex(e => e.id === ep.id);
                                if (idx !== -1) {
                                  newState.customEndpoints[idx] = updated;
                                  localStorage.setItem("gemma-api-keys", JSON.stringify(newState));
                                  setState(newState);
                                }
                              }}
                              onRemove={() => {
                                setState(removeCustomEndpoint(ep.id));
                              }}
                            />
                          ))}
                          <button onClick={() => handleQuickAddLocal(type)}
                            className="flex items-center gap-1 text-[10px] font-medium transition-colors hover:text-[var(--accent-color)]"
                            style={{ color: "var(--text-tertiary)" }}>
                            <Plus className="w-3 h-3" />
                            Add another {info.name} model
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Auto-detect hint */}
                <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
                  style={{ background: "var(--bg-tertiary)" }}>
                  <Server className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "var(--text-tertiary)" }} />
                  <div>
                    <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                      Local models are auto-detected when LM Studio or Ollama is running. Configure manually above to set a specific model ID or custom endpoint.
                    </p>
                    <p className="text-[10px] mt-1 font-mono" style={{ color: "var(--text-quaternary)" }}>
                      Model IDs appear in the model picker as lmstudio/... or ollama/...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Custom Endpoints Tab ─────────────────────────────────────── */}
            {activeTab === "endpoints" && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
                    OpenAI-compatible endpoints
                  </p>
                  {!showAddEndpoint && (
                    <button onClick={() => setShowAddEndpoint(true)}
                      className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all duration-200 active:scale-95"
                      style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}>
                      <Plus className="w-3 h-3" />
                      Add
                    </button>
                  )}
                </div>

                {showAddEndpoint && (
                  <div className="mb-3 p-3.5 rounded-xl space-y-2.5"
                    style={{ background: "var(--bg-tertiary)", border: "1px solid var(--accent-color)" }}>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Name" value={newEndpoint.name}
                        onChange={(e) => setNewEndpoint({ ...newEndpoint, name: e.target.value })}
                        className="flex-1 rounded-md px-2.5 py-1.5 text-[11px] border outline-none transition-all duration-200 focus:border-[var(--accent-color)]"
                        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                      <select value={newEndpoint.provider}
                        onChange={(e) => setNewEndpoint({ ...newEndpoint, provider: e.target.value as CustomEndpoint["provider"] })}
                        className="rounded-md px-2 py-1.5 text-[11px] border outline-none cursor-pointer"
                        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="custom">Other</option>
                      </select>
                    </div>
                    <input type="text" placeholder="Endpoint URL (e.g. http://localhost:8080/v1)" value={newEndpoint.endpoint}
                      onChange={(e) => setNewEndpoint({ ...newEndpoint, endpoint: e.target.value })}
                      className="w-full rounded-md px-2.5 py-1.5 text-[11px] border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                    <input type="text" placeholder="Model ID (e.g. gpt-4, claude-3-opus)" value={newEndpoint.modelId}
                      onChange={(e) => setNewEndpoint({ ...newEndpoint, modelId: e.target.value })}
                      className="w-full rounded-md px-2.5 py-1.5 text-[11px] border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                    <input type="password" placeholder="API Key (optional)" value={newEndpoint.apiKey}
                      onChange={(e) => setNewEndpoint({ ...newEndpoint, apiKey: e.target.value })}
                      className="w-full rounded-md px-2.5 py-1.5 text-[11px] border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
                      style={{ background: "var(--bg-secondary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
                    <div className="flex gap-2 pt-0.5">
                      <button onClick={handleAddEndpoint} disabled={!newEndpoint.name || !newEndpoint.endpoint}
                        className="flex-1 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: "var(--accent-color)", color: "#ffffff" }}>
                        Add Endpoint
                      </button>
                      <button onClick={() => setShowAddEndpoint(false)}
                        className="rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors"
                        style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {remoteEndpoints.map((endpoint) => (
                    <div key={endpoint.id} className="rounded-xl p-3.5 transition-all duration-200"
                      style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                          style={{ background: "var(--accent-glow)" }}>
                          <Globe className="w-4 h-4" style={{ color: "var(--accent-color)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{endpoint.name}</span>
                            <span className="text-[9px] uppercase font-medium px-1.5 py-0.5 rounded-full"
                              style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
                              {endpoint.provider}
                            </span>
                            {endpoint.modelId && (
                              <code className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
                                style={{ background: "var(--accent-glow)", color: "var(--accent-color)" }}>
                                {endpoint.modelId}
                              </code>
                            )}
                          </div>
                          <code className="text-[10px] block mt-0.5 font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                            {endpoint.endpoint}
                          </code>
                        </div>
                        <button onClick={() => setState(removeCustomEndpoint(endpoint.id))}
                          className="rounded-md p-1.5 transition-colors hover:bg-red-500/10 hover:text-red-400 flex-shrink-0"
                          style={{ color: "var(--text-tertiary)" }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {remoteEndpoints.length === 0 && !showAddEndpoint && (
                    <div className="text-center py-6 rounded-xl"
                      style={{ background: "var(--bg-tertiary)", border: "1px dashed var(--border-color)" }}>
                      <Globe className="w-6 h-6 mx-auto mb-1.5" style={{ color: "var(--text-tertiary)", opacity: 0.5 }} />
                      <p className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>No custom endpoints</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-quaternary)" }}>Any OpenAI-compatible API</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Security notice */}
            <div className="mt-4 flex items-start gap-2.5 px-3 py-2.5 rounded-lg"
              style={{ background: "var(--bg-tertiary)" }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: "var(--text-tertiary)" }} />
              <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                All keys and endpoints are stored in your browser&apos;s localStorage. They never leave your device.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Local Endpoint Card ─────────────────────────────────────────────────────────

function LocalEndpointCard({
  endpoint,
  placeholderModel,
  onUpdate,
  onRemove,
}: {
  endpoint: CustomEndpoint;
  placeholderModel: string;
  onUpdate: (updated: CustomEndpoint) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [endpointUrl, setEndpointUrl] = useState(endpoint.endpoint);
  const [modelId, setModelId] = useState(endpoint.modelId || "");

  const handleSave = () => {
    setEditing(false);
    onUpdate({ ...endpoint, endpoint: endpointUrl, modelId });
  };

  if (editing) {
    return (
      <div className="rounded-lg p-3 space-y-2"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--accent-color)" }}>
        <input type="text" value={endpointUrl}
          onChange={(e) => setEndpointUrl(e.target.value)}
          placeholder="http://localhost:..."
          className="w-full rounded-md px-2.5 py-1.5 text-[11px] border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
          style={{ background: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
        <input type="text" value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder={placeholderModel}
          className="w-full rounded-md px-2.5 py-1.5 text-[11px] border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
          style={{ background: "var(--bg-tertiary)", borderColor: "var(--border-color)", color: "var(--text-primary)" }} />
        <div className="flex gap-2">
          <button onClick={handleSave}
            className="flex-1 rounded-md px-2.5 py-1.5 text-[10px] font-medium"
            style={{ background: "var(--accent-color)", color: "#fff" }}>
            Save
          </button>
          <button onClick={() => { setEditing(false); setEndpointUrl(endpoint.endpoint); setModelId(endpoint.modelId || ""); }}
            className="rounded-md px-2.5 py-1.5 text-[10px] font-medium"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-3 transition-all duration-200 group"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-[10px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
              {endpointUrl}
            </code>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[9px] font-medium" style={{ color: "var(--text-tertiary)" }}>Model:</span>
            {modelId ? (
              <code className="text-[10px] font-mono" style={{ color: "var(--accent-color)" }}>{modelId}</code>
            ) : (
              <button onClick={() => setEditing(true)}
                className="text-[10px] italic transition-colors hover:text-[var(--accent-color)]"
                style={{ color: "var(--text-quaternary)" }}>
                Click to set model ID
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)}
            className="rounded p-1 transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: "var(--text-tertiary)" }}>
            <Settings className="w-3 h-3" />
          </button>
          <button onClick={onRemove}
            className="rounded p-1 transition-colors hover:bg-red-500/10 hover:text-red-400"
            style={{ color: "var(--text-tertiary)" }}>
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
