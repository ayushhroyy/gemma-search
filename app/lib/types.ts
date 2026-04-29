import React from "react";

// ─── Model Types ────────────────────────────────────────────────────────────

export interface LocalModel {
  id: string;
  label: string;
  provider: string;
}

export const GEMMA_MODELS = [
  { id: "google/gemma-3-27b-it:free",           label: "Gemma 3 27B (Free)" },
  { id: "deepseek/deepseek-r1:free",            label: "DeepSeek R1 (Free)" },
  { id: "deepseek/deepseek-chat-v3-0324:free",  label: "DeepSeek V3 (Free)" },
  { id: "qwen/qwen3-32b:free",                  label: "Qwen 3 32B (Free)" },
  { id: "google/gemma-3-12b-it:free",           label: "Gemma 3 12B (Free)" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 (Free)" },
  { id: "meta-llama/llama-4-maverick:free",     label: "Llama 4 Maverick (Free)" },
  { id: "meta-llama/llama-4-scout:free",        label: "Llama 4 Scout (Free)" },
  { id: "google/gemini-2.0-flash-exp:free",     label: "Gemini 2.0 Flash (Free)" },
  { id: "qwen/qwen3-235b-a22b:free",            label: "Qwen 3 235B MoE (Free)" },
  { id: "rekaai/reka-flash-3:free",             label: "Reka Flash 3 (Free)" },
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
  router:   "google/gemma-3-27b-it:free",
  selector: "google/gemma-3-27b-it:free",
  writer:   "google/gemma-3-27b-it:free",
  uniMode:  true,
  uni:      "google/gemma-3-27b-it:free",
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
