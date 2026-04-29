// ─── API Keys Configuration System ────────────────────────────────────────────────

export type ApiProvider =
  | "openrouter"
  | "deepseek"
  | "openai"
  | "gemini"
  | "anthropic"
  | "serper"
  | "searxng"
  | "custom";

export interface ApiKeyConfig {
  provider: ApiProvider;
  key: string;
  endpoint?: string; // For custom providers or SearxNG
  label?: string; // Custom label for the key
  isDefault?: boolean;
}

export interface ApiKeysState {
  keys: Record<ApiProvider, ApiKeyConfig | null>;
  customEndpoints: Array<{
    id: string;
    name: string;
    endpoint: string;
    apiKey?: string;
    provider: "openai" | "anthropic" | "custom";
  }>;
}

const DEFAULT_STATE: ApiKeysState = {
  keys: {
    openrouter: null,
    deepseek: null,
    openai: null,
    gemini: null,
    anthropic: null,
    serper: null,
    searxng: null,
    custom: null,
  },
  customEndpoints: [],
};

const STORAGE_KEY = "gemma-api-keys";

export function loadApiKeysState(): ApiKeysState {
  if (typeof window === "undefined") return DEFAULT_STATE;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_STATE, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn("Failed to load API keys state:", e);
  }
  return DEFAULT_STATE;
}

export function saveApiKeysState(state: ApiKeysState): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to save API keys state:", e);
  }
}

export function setApiKey(provider: ApiProvider, config: ApiKeyConfig | null): ApiKeysState {
  const state = loadApiKeysState();
  state.keys[provider] = config;
  saveApiKeysState(state);
  return state;
}

export function getApiKey(provider: ApiProvider): ApiKeyConfig | null {
  const state = loadApiKeysState();
  return state.keys[provider];
}

export function addCustomEndpoint(endpoint: Omit<ApiKeysState["customEndpoints"][number], "id">): ApiKeysState {
  const state = loadApiKeysState();
  state.customEndpoints.push({
    ...endpoint,
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  });
  saveApiKeysState(state);
  return state;
}

export function removeCustomEndpoint(id: string): ApiKeysState {
  const state = loadApiKeysState();
  state.customEndpoints = state.customEndpoints.filter(e => e.id !== id);
  saveApiKeysState(state);
  return state;
}

export function getApiKeysForRequest(): Record<string, string> {
  const state = loadApiKeysState();
  const result: Record<string, string> = {};

  for (const [provider, config] of Object.entries(state.keys)) {
    if (config?.key) {
      result[provider] = config.key;
    }
  }

  // Add custom endpoint keys
  for (const endpoint of state.customEndpoints) {
    if (endpoint.apiKey) {
      result[`endpoint_${endpoint.id}`] = endpoint.apiKey;
    }
  }

  return result;
}

// Provider metadata for UI
export const PROVIDER_INFO: Record<ApiProvider, {
  name: string;
  description: string;
  icon: string;
  color: string;
  requiresEndpoint?: boolean;
  placeholderKey: string;
  placeholderEndpoint?: string;
}> = {
  openrouter: {
    name: "OpenRouter",
    description: "Access to 100+ LLM providers via unified API",
    icon: "🔀",
    color: "#8b5cf6",
    placeholderKey: "sk-or-v1-...",
  },
  deepseek: {
    name: "DeepSeek",
    description: "High-performance open-source models",
    icon: "🔍",
    color: "#3b82f6",
    placeholderKey: "sk-...",
  },
  openai: {
    name: "OpenAI",
    description: "GPT-4, GPT-4o, and more",
    icon: "🤖",
    color: "#10a37f",
    placeholderKey: "sk-proj-...",
  },
  gemini: {
    name: "Google Gemini",
    description: "Google's Gemini AI models",
    icon: "✨",
    color: "#4285f4",
    placeholderKey: "AIza...",
  },
  anthropic: {
    name: "Anthropic",
    description: "Claude 3.5 Sonnet, Opus, and more",
    icon: "🧠",
    color: "#d97706",
    placeholderKey: "sk-ant-...",
  },
  serper: {
    name: "Serper",
    description: "Google Search API for real-time results",
    icon: "🔎",
    color: "#f59e0b",
    placeholderKey: "Your Serper API key",
  },
  searxng: {
    name: "SearxNG",
    description: "Self-hosted metasearch engine",
    icon: "🔬",
    color: "#6366f1",
    requiresEndpoint: true,
    placeholderKey: "Optional authentication token",
    placeholderEndpoint: "https://your-searxng-instance.com",
  },
  custom: {
    name: "Custom Endpoint",
    description: "OpenAI-compatible custom endpoint",
    icon: "🔧",
    color: "#64748b",
    requiresEndpoint: true,
    placeholderKey: "Bearer token (optional)",
    placeholderEndpoint: "https://your-endpoint.com/v1/chat/completions",
  },
};
