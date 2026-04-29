import React from "react";

// ─── Model Types ────────────────────────────────────────────────────────────

export interface LocalModel {
  id: string;
  label: string;
  provider: string;
}

export const GEMMA_MODELS = [
  { id: "google/gemma-4-31b-it",                label: "Gemma 4 31B" },
  { id: "google/gemma-4-26b-a4b-it",            label: "Gemma 4 26B" },
  { id: "google/gemma-3-27b-it",                label: "Gemma 3 27B" },
  { id: "google/gemma-3-12b-it",                label: "Gemma 3 12B" },
  { id: "mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 24B" },
  { id: "mistralai/ministral-14b-2512",          label: "Ministral 14B" },
  { id: "mistralai/ministral-8b-2512",           label: "Ministral 8B" },
  { id: "mistralai/ministral-3b-2512",           label: "Ministral 3B" },
  { id: "qwen/qwen3.5-9b",                      label: "Qwen 3.5 9B" },
  { id: "qwen/qwen3-32b",                        label: "Qwen 3 32B" },
  { id: "qwen/qwen3-30b-a3b-instruct-2507",     label: "Qwen 3 30B MoE" },
] as const;

export type GemmaModelId = (typeof GEMMA_MODELS)[number]["id"];

export interface ModelConfig {
  router:   string;
  selector: string;
  writer:   string;
  uniMode:  boolean;
  uni:      string;
}

export const DEFAULT_MODELS: ModelConfig = {
  router:   "google/gemma-4-31b-it",
  selector: "google/gemma-4-26b-a4b-it",
  writer:   "qwen/qwen3.5-9b",
  uniMode:  false,
  uni:      "google/gemma-4-31b-it",
};

// ─── Message Types ──────────────────────────────────────────────────────────

export interface Source {
  title: string;
  url: string;
  snippet: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  status?: "sending" | "streaming" | "done" | "error";
  sources?: Source[];
  image?: string;
  cost?: number;
  reasoning?: string;
  promptTokens?: number;
  completionTokens?: number;
}

// ─── SSE Buffer Limit ───────────────────────────────────────────────────────

export const MAX_SSE_BUFFER = 1_048_576; // 1 MB
