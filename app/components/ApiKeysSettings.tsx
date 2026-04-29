"use client";

import React, { useState, useEffect } from "react";
import { X, Key, Plus, Trash2, Eye, EyeOff, Check, AlertCircle, Globe } from "lucide-react";
import {
  loadApiKeysState,
  saveApiKeysState,
  setApiKey,
  addCustomEndpoint,
  removeCustomEndpoint,
  type ApiProvider,
  type ApiKeysState,
  type ApiKeyConfig,
  PROVIDER_INFO,
} from "../lib/apiKeys";

interface ApiKeysSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeysSettings({ isOpen, onClose }: ApiKeysSettingsProps) {
  const [state, setState] = useState<ApiKeysState>(loadApiKeysState());
  const [visibleKeys, setVisibleKeys] = useState<Set<ApiProvider>>(new Set());
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState({
    name: "",
    endpoint: "",
    apiKey: "",
    provider: "openai" as const,
  });

  useEffect(() => {
    if (isOpen) {
      setState(loadApiKeysState());
    }
  }, [isOpen]);

  const handleSetKey = (provider: ApiProvider, key: string, endpoint?: string) => {
    const config: ApiKeyConfig | null = key
      ? { provider, key, endpoint }
      : null;
    const newState = setApiKey(provider, config);
    setState(newState);
  };

  const handleRemoveKey = (provider: ApiProvider) => {
    handleSetKey(provider, "");
  };

  const toggleKeyVisibility = (provider: ApiProvider) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const handleAddEndpoint = () => {
    if (!newEndpoint.name || !newEndpoint.endpoint) return;

    const endpoint = {
      name: newEndpoint.name,
      endpoint: newEndpoint.endpoint,
      apiKey: newEndpoint.apiKey || undefined,
      provider: newEndpoint.provider,
    };

    const newState = addCustomEndpoint(endpoint);
    setState(newState);
    setNewEndpoint({ name: "", endpoint: "", apiKey: "", provider: "openai" });
    setShowAddEndpoint(false);
  };

  const handleRemoveEndpoint = (id: string) => {
    const newState = removeCustomEndpoint(id);
    setState(newState);
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 12))}${key.slice(-4)}`;
  };

  const providers: ApiProvider[] = [
    "openrouter",
    "deepseek",
    "openai",
    "gemini",
    "anthropic",
    "serper",
    "searxng",
  ];

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        <div
          className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl shadow-2xl transition-all duration-300 animate-scale-in"
          style={{
            background: "linear-gradient(145deg, var(--bg-secondary), var(--bg-tertiary))",
            border: "1px solid var(--border-color)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: "var(--border-color)" }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: "var(--accent-glow)" }}>
                <Key className="w-5 h-5" style={{ color: "var(--accent-color)" }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>API Keys</h2>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Configure your provider keys</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-2 transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{ color: "var(--text-secondary)" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto px-6 py-5" style={{ maxHeight: "calc(85vh - 140px)" }}>
            {/* Provider Keys Section */}
            <div className="mb-6">
              <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "var(--text-tertiary)" }}>
                Provider Keys
              </h3>
              <div className="space-y-3">
                {providers.map((provider) => {
                  const info = PROVIDER_INFO[provider];
                  const config = state.keys[provider];
                  const isVisible = visibleKeys.has(provider);

                  return (
                    <div
                      key={provider}
                      className="rounded-xl p-4 transition-all duration-200 hover:scale-[1.01]"
                      style={{
                        background: "var(--bg-tertiary)",
                        border: "1px solid var(--border-color)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 text-2xl">{info.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                              {info.name}
                            </span>
                            {config && (
                              <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent-glow)", color: "var(--accent-color)" }}>
                                <Check className="w-3 h-3" />
                                Configured
                              </span>
                            )}
                          </div>
                          <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
                            {info.description}
                          </p>

                          {config ? (
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-xs px-3 py-2 rounded-lg font-mono" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                                {isVisible ? config.key : maskKey(config.key)}
                              </code>
                              <button
                                onClick={() => toggleKeyVisibility(provider)}
                                className="rounded-lg p-2 transition-colors hover:bg-[var(--bg-secondary)]"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleRemoveKey(provider)}
                                className="rounded-lg p-2 transition-colors hover:bg-red-500/10 hover:text-red-500"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <input
                                type={isVisible ? "text" : "password"}
                                placeholder={info.placeholderKey}
                                value={visibleKeys.has(provider) ? "" : ""}
                                onChange={(e) => handleSetKey(provider, e.target.value, info.requiresEndpoint ? "" : undefined)}
                                className="flex-1 rounded-lg px-3 py-2 text-xs border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
                                style={{
                                  background: "var(--bg-secondary)",
                                  borderColor: "var(--border-color)",
                                  color: "var(--text-primary)",
                                }}
                              />
                              {info.requiresEndpoint && (
                                <input
                                  type="text"
                                  placeholder={info.placeholderEndpoint}
                                  className="flex-1 rounded-lg px-3 py-2 text-xs border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
                                  style={{
                                    background: "var(--bg-secondary)",
                                    borderColor: "var(--border-color)",
                                    color: "var(--text-primary)",
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Endpoints Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  Custom Endpoints
                </h3>
                {!showAddEndpoint && (
                  <button
                    onClick={() => setShowAddEndpoint(true)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:scale-105"
                    style={{
                      background: "var(--accent-glow)",
                      color: "var(--accent-color)",
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Endpoint
                  </button>
                )}
              </div>

              {showAddEndpoint && (
                <div className="mb-4 p-4 rounded-xl space-y-3" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--accent-color)" }}>
                  <input
                    type="text"
                    placeholder="Endpoint name"
                    value={newEndpoint.name}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, name: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-xs border outline-none transition-all duration-200 focus:border-[var(--accent-color)]"
                    style={{
                      background: "var(--bg-secondary)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Endpoint URL"
                    value={newEndpoint.endpoint}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, endpoint: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-xs border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
                    style={{
                      background: "var(--bg-secondary)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <input
                    type="password"
                    placeholder="API Key (optional)"
                    value={newEndpoint.apiKey}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, apiKey: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-xs border outline-none font-mono transition-all duration-200 focus:border-[var(--accent-color)]"
                    style={{
                      background: "var(--bg-secondary)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddEndpoint}
                      disabled={!newEndpoint.name || !newEndpoint.endpoint}
                      className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: "var(--accent-color)",
                        color: "#ffffff",
                      }}
                    >
                      Add Endpoint
                    </button>
                    <button
                      onClick={() => setShowAddEndpoint(false)}
                      className="rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                      style={{
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {state.customEndpoints.map((endpoint) => (
                  <div
                    key={endpoint.id}
                    className="rounded-xl p-4 transition-all duration-200 hover:scale-[1.01]"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: "var(--accent-glow)" }}>
                        <Globe className="w-5 h-5" style={{ color: "var(--accent-color)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                            {endpoint.name}
                          </span>
                          <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--bg-secondary)", color: "var(--text-tertiary)" }}>
                            {endpoint.provider}
                          </span>
                        </div>
                        <code className="text-xs block mb-2 font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                          {endpoint.endpoint}
                        </code>
                        {endpoint.apiKey && (
                          <code className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
                            {maskKey(endpoint.apiKey)}
                          </code>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveEndpoint(endpoint.id)}
                        className="rounded-lg p-2 transition-colors hover:bg-red-500/10 hover:text-red-500 flex-shrink-0"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {state.customEndpoints.length === 0 && !showAddEndpoint && (
                  <div className="text-center py-8 rounded-xl" style={{ background: "var(--bg-tertiary)", border: "1px dashed var(--border-color)" }}>
                    <Globe className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} />
                    <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No custom endpoints configured</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-quaternary)" }}>Add OpenAI-compatible endpoints</p>
                  </div>
                )}
              </div>
            </div>

            {/* Info Box */}
            <div className="mt-6 p-4 rounded-xl flex gap-3" style={{ background: "var(--accent-glow)", border: "1px solid var(--accent-color)" }}>
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--accent-color)" }} />
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--accent-color)" }}>
                  Keys stored locally
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                  Your API keys are stored in your browser's localStorage and never sent to our servers. They're only used when making requests to the respective providers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
