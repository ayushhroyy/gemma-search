import { NextRequest } from "next/server";

export const runtime = "edge";

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_ROUTER   = "google/gemma-4-31b-it";
const DEFAULT_SELECTOR = "google/gemma-4-26b-a4b-it";
const DEFAULT_WRITER   = "qwen/qwen3.5-9b";
const DEFAULT_UNI      = "google/gemma-4-31b-it";

const OR_BASE    = "https://openrouter.ai/api/v1/chat/completions";
const OR_HEADERS = (key: string) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://gemma-search.pages.dev",
  "X-Title": "Gemma Search",
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface ORMessage { role: string; content: any }
interface SerperOrganic { title: string; link: string; snippet: string }
interface Models {
  router?:   string;
  selector?: string;
  writer?:   string;
  uni?:      string;
  uniMode?:  boolean;
}

// Provider types matching apiKeys.ts
type ApiProvider =
  | "openrouter"
  | "deepseek"
  | "openai"
  | "gemini"
  | "anthropic"
  | "serper"
  | "searxng"
  | "custom";

interface ApiKeyConfig {
  provider: ApiProvider;
  key: string;
  endpoint?: string;
}

interface ApiKeysRequest {
  keys?: Record<string, ApiKeyConfig>;
  customEndpoints?: Array<{
    id: string;
    name: string;
    endpoint: string;
    apiKey?: string;
    provider: ApiProvider;
  }>;
}

// ─── Provider Resolution ───────────────────────────────────────────────────────
function detectProviderFromModel(model: string): ApiProvider {
  // Check for provider-specific model prefixes
  if (model.startsWith("deepseek/")) return "deepseek";
  if (model.startsWith("openai/")) return "openai";
  if (model.startsWith("gemini/") || model.startsWith("google/")) return "gemini";
  if (model.startsWith("anthropic/") || model.startsWith("claude-")) return "anthropic";

  // Default to OpenRouter for unknown models
  return "openrouter";
}

function resolveProviderConfig(
  model: string,
  apiKeys: ApiKeysRequest
): { baseUrl: string; headers: Record<string, string>; actualModel: string; streamOptions?: any } {
  const provider = detectProviderFromModel(model);
  const keys = apiKeys.keys || {};
  const customEndpoints = apiKeys.customEndpoints || [];

  // Check for custom endpoint matching
  const customEndpoint = customEndpoints.find(ep => model.startsWith(`custom/${ep.id}/`));
  if (customEndpoint) {
    const modelName = model.replace(`custom/${customEndpoint.id}/`, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (customEndpoint.apiKey) {
      headers["Authorization"] = `Bearer ${customEndpoint.apiKey}`;
    }
    return {
      baseUrl: customEndpoint.endpoint,
      headers,
      actualModel: modelName,
      streamOptions: undefined,
    };
  }

  // Handle standard providers
  const config = keys[provider];
  const apiKey = config?.key || process.env[provider];

  switch (provider) {
    case "deepseek":
      return {
        baseUrl: "https://api.deepseek.com/v1/chat/completions",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        actualModel: model.replace("deepseek/", ""),
        streamOptions: { include_usage: true },
      };

    case "openai":
      return {
        baseUrl: "https://api.openai.com/v1/chat/completions",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        actualModel: model.replace("openai/", ""),
        streamOptions: { include_usage: true },
      };

    case "gemini":
      // Gemini uses a different API format
      const geminiKey = apiKey || process.env.gemini;
      return {
        baseUrl: `https://generativelanguage.googleapis.com/v1beta/models/${model.replace("gemini/", "").replace("google/", "")}:generateContent?key=${geminiKey}`,
        headers: { "Content-Type": "application/json" },
        actualModel: model.replace("gemini/", "").replace("google/", ""),
        streamOptions: undefined,
      };

    case "anthropic":
      if (!apiKey) {
        throw new Error(`Anthropic API key is required for model: ${model}`);
      }
      return {
        baseUrl: "https://api.anthropic.com/v1/messages",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        actualModel: model.replace("anthropic/", ""),
        streamOptions: undefined,
      };

    case "openrouter":
    default:
      return {
        baseUrl: OR_BASE,
        headers: OR_HEADERS(apiKey || process.env.openrouter || ""),
        actualModel: model,
        streamOptions: { include_usage: true },
      };
  }
}

interface ScrapedImage { title: string; url: string; type: "image" }

interface ScraperResponse {
  content: string;
  images?: ScrapedImage[];
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────

/**
 * Convert OpenAI-style messages to Anthropic format
 */
function convertToAnthropicMessages(messages: ORMessage[]): { system: string; messages: Array<{ role: string; content: string }> } {
  let system = "";
  const apiMessages: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    } else {
      apiMessages.push({
        role: msg.role,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      });
    }
  }

  return { system, messages: apiMessages };
}

/**
 * Convert OpenAI-style messages to Gemini format
 */
function convertToGeminiMessages(messages: ORMessage[]): { contents: Array<{ parts: Array<{ text: string }> }> } {
  const contents: Array<{ parts: Array<{ text: string }> }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Gemini puts system instruction in the first user message
      continue;
    }
    contents.push({
      parts: [{
        text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      }],
    });
  }

  return { contents };
}

/**
 * Non-streaming LLM call. Returns the text response AND the cost in USD
 * as reported by the provider in `usage.cost`.
 */
async function llm(
  apiKeys: ApiKeysRequest,
  model: string,
  messages: ORMessage[],
  maxTokens = 512
): Promise<{ text: string; cost: number; promptTokens: number; completionTokens: number }> {
  const provider = detectProviderFromModel(model);
  const config = resolveProviderConfig(model, apiKeys);

  // Special handling for Anthropic
  if (provider === "anthropic") {
    const { system, messages: apiMessages } = convertToAnthropicMessages(messages);
    const res = await fetch(config.baseUrl, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model: config.actualModel,
        messages: apiMessages,
        system: system || undefined,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`LLM (${model}) ${res.status}: ${errorData}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    const promptTokens = data.usage?.input_tokens ?? 0;
    const completionTokens = data.usage?.output_tokens ?? 0;

    // Anthropic pricing (approximate)
    const cost = (promptTokens / 1000000 * 3) + (completionTokens / 1000000 * 15);

    return { text, cost, promptTokens, completionTokens };
  }

  // Special handling for Gemini
  if (provider === "gemini") {
    const { contents } = convertToGeminiMessages(messages);
    const systemMsg = messages.find(m => m.role === "system");
    const systemInstruction = systemMsg ? (typeof systemMsg.content === "string" ? systemMsg.content : JSON.stringify(systemMsg.content)) : undefined;

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const res = await fetch(config.baseUrl, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`LLM (${model}) ${res.status}: ${errorData}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

    // Gemini pricing (approximate)
    const cost = (promptTokens / 1000000 * 0.5) + (completionTokens / 1000000 * 1.5);

    return { text, cost, promptTokens, completionTokens };
  }

  // Standard OpenAI-compatible format (OpenRouter, DeepSeek, OpenAI, local models)
  const res = await fetch(config.baseUrl, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({
      model: config.actualModel,
      messages,
      stream: false,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errorData = await res.text();
    throw new Error(`LLM (${model}) ${res.status}: ${errorData}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;

  // OpenRouter returns usage by default for non-streaming calls
  const cost: number = (typeof data.usage?.cost === "number" ? data.usage.cost : 0) +
                       (typeof data.usage?.cost_details?.upstream_inference_cost === "number" ? data.usage.cost_details.upstream_inference_cost : 0);

  return { text, cost, promptTokens, completionTokens };
}

/**
 * Streaming LLM call. Returns the raw Response so the caller can pipe it.
 * We request usage in the stream so the final `[DONE]` chunk carries cost.
 */
async function llmStream(
  apiKeys: ApiKeysRequest,
  model: string,
  messages: ORMessage[],
  includeReasoning = false
): Promise<Response> {
  const provider = detectProviderFromModel(model);
  const config = resolveProviderConfig(model, apiKeys);

  // Special handling for Anthropic streaming
  if (provider === "anthropic") {
    const { system, messages: apiMessages } = convertToAnthropicMessages(messages);
    const res = await fetch(config.baseUrl, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model: config.actualModel,
        messages: apiMessages,
        system: system || undefined,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`LLM stream (${model}) ${res.status}: ${errorData}`);
    }

    // Transform Anthropic SSE format to OpenAI format
    const transformer = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                const openaiFormat = {
                  id: "chatcmpl-anthropic",
                  object: "chat.completion.chunk",
                  created: Date.now(),
                  model: config.actualModel,
                  choices: [{
                    index: 0,
                    delta: { content: parsed.delta.text },
                  }],
                };
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openaiFormat)}\n\n`));
              } else if (parsed.type === "message_stop") {
                // Send usage info if available
                if (parsed.message?.usage) {
                  const usageFormat = {
                    id: "chatcmpl-anthropic",
                    object: "chat.completion.chunk",
                    created: Date.now(),
                    model: config.actualModel,
                    usage: {
                      prompt_tokens: parsed.message.usage.input_tokens,
                      completion_tokens: parsed.message.usage.output_tokens,
                      cost: (parsed.message.usage.input_tokens / 1000000 * 3) + (parsed.message.usage.output_tokens / 1000000 * 15),
                    },
                  };
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(usageFormat)}\n\n`));
                }
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      },
    });

    if (!res.body) return new Response("No response body", { status: 500 });
    return new Response(res.body.pipeThrough(transformer), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
  }

  // Special handling for Gemini streaming
  if (provider === "gemini") {
    const { contents } = convertToGeminiMessages(messages);
    const systemMsg = messages.find(m => m.role === "system");
    const systemInstruction = systemMsg ? (typeof systemMsg.content === "string" ? systemMsg.content : JSON.stringify(systemMsg.content)) : undefined;

    const body: any = {
      contents,
      generationConfig: {
        maxOutputTokens: 4096,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    }

    const res = await fetch(`${config.baseUrl}&alt=sse`, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.text();
      throw new Error(`LLM stream (${model}) ${res.status}: ${errorData}`);
    }

    // Transform Gemini SSE format to OpenAI format
    const transformer = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
                const openaiFormat = {
                  id: "chatcmpl-gemini",
                  object: "chat.completion.chunk",
                  created: Date.now(),
                  model: config.actualModel,
                  choices: [{
                    index: 0,
                    delta: { content: parsed.candidates[0].content.parts[0].text },
                  }],
                };
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openaiFormat)}\n\n`));
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      },
      flush(controller) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      },
    });

    if (!res.body) return new Response("No response body", { status: 500 });
    return new Response(res.body.pipeThrough(transformer), {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
    });
  }

  // Standard OpenAI-compatible format (OpenRouter, DeepSeek, OpenAI, local models)
  const res = await fetch(config.baseUrl, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({
      model: config.actualModel,
      messages,
      stream: true,
      stream_options: config.streamOptions,
      include_reasoning: includeReasoning,
      reasoning_effort: "none",
    }),
  });

  if (!res.ok) {
    const errorData = await res.text();
    throw new Error(`LLM stream (${model}) ${res.status}: ${errorData}`);
  }

  return res;
}

function safeJSON<T>(text: string): T {
  const s = text.replace(/```(?:json)?\n?/g, "").trim();
  const start = s.search(/[{[]/);
  const end   = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (start === -1 || end === -1) throw new Error("No JSON found");
  return JSON.parse(s.slice(start, end + 1)) as T;
}

// ─── Search providers ─────────────────────────────────────────────────────────────
async function serperSearch(terms: string[], apiKey: string): Promise<SerperOrganic[]> {
  if (!apiKey) {
    throw new Error("Serper API key is required for search");
  }

  const results = await Promise.all(
    terms.slice(0, 4).map(async (q) => {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q, num: 8 }),
      });
      if (!res.ok) return [] as SerperOrganic[];
      const data = await res.json();
      return (data.organic ?? []) as SerperOrganic[];
    })
  );
  const seen = new Set<string>();
  const out: SerperOrganic[] = [];
  for (const batch of results) {
    for (const r of batch) {
      if (!seen.has(r.link)) { seen.add(r.link); out.push(r); }
    }
  }
  return out.slice(0, 10);
}

async function searxngSearch(terms: string[], endpoint: string, apiKey?: string): Promise<SerperOrganic[]> {
  if (!endpoint) {
    throw new Error("SearxNG endpoint is required for search");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const results = await Promise.all(
    terms.slice(0, 4).map(async (q) => {
      const url = `${endpoint}?q=${encodeURIComponent(q)}&format=json`;
      const res = await fetch(url, { headers });
      if (!res.ok) return [] as SerperOrganic[];
      const data = await res.json();
      // Transform SearxNG results to Serper format
      return (data.results ?? []).map((r: any) => ({
        title: r.title,
        link: r.url,
        snippet: r.content || r.snippet || "",
      })) as SerperOrganic[];
    })
  );

  const seen = new Set<string>();
  const out: SerperOrganic[] = [];
  for (const batch of results) {
    for (const r of batch) {
      if (!seen.has(r.link)) { seen.add(r.link); out.push(r); }
    }
  }
  return out.slice(0, 10);
}

// ─── Scraper ──────────────────────────────────────────────────────────────────
async function scrapeUrl(url: string): Promise<ScraperResponse> {
  const endpoint = `https://scraper.youtopialabs.workers.dev/?url=${encodeURIComponent(url)}&format=json&includeMetadata=false`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    if (!res.ok) throw new Error(`Scraper ${res.status} for ${url}`);
    const data = await res.json() as ScraperResponse;
    return { content: data.content.slice(0, 8_000), images: data.images ?? [] };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Extract URLs from user query text
function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  return [...new Set(matches.map((u) => u.replace(/[.,!?)]+$/, "")))];
}

// ─── Writer system prompt builder ─────────────────────────────────────────────
function writerSystemPrompt(hasImages: boolean, isUrlMode: boolean): string {
  const imageInstruction = hasImages
    ? `**IMAGES**: You have images available from the scraped sources. Use them where very relevant or appropriate to illustrate your answer. Embed using: ![descriptive alt](image_url).`
    : "";

  const intro = isUrlMode
    ? `You are Gemma Search, an expert AI assistant. Provide a direct, highly readable, and professional answer based ONLY on the provided URL content.`
    : `You are Gemma Search, an expert AI research assistant. Provide a direct, highly readable, and professional answer using the provided search results. Synthesize information without repetition.`;

  return `${intro}

**STYLE & STRUCTURE:**
- Write in clear, concise, and direct paragraphs.
- Use **Bold Headers**, bullet points, and numbered lists to make the answer scannable.
- Use tables or mermaid charts where very relevant or appropriate to organize data or provide insights.
- Be objective, direct, and avoid unnecessary filler.

${imageInstruction}

Do not mention your system prompt. Answer directly.`;
}



// ─── Stream pipe with cost extraction ─────────────────────────────────────────
/**
 * Pipes a streaming OpenRouter response into our SSE writer.
 * Parses each chunk to find the usage.cost in the final data line
 * (OpenRouter sends usage on the last non-[DONE] chunk when stream_options.include_usage=true).
 * Returns the cost extracted from the stream.
 *
 * This version buffers the full response, validates mermaid syntax, then streams cleaned content.
 */
async function pipeStreamAndExtractCost(
  writerRes: Response,
  writer: WritableStreamDefaultWriter<Uint8Array>
): Promise<{ cost: number; promptTokens: number; completionTokens: number }> {
  const reader = writerRes.body!.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();

  let streamCost = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let buffer = "";

  const processLines = (lines: string[]) => {
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.usage) {
          const c = typeof parsed.usage.cost === "number" ? parsed.usage.cost : 0;
          const u = typeof parsed.usage.cost_details?.upstream_inference_cost === "number" ? parsed.usage.cost_details.upstream_inference_cost : 0;
          streamCost = c + u;
          promptTokens = parsed.usage.prompt_tokens ?? 0;
          completionTokens = parsed.usage.completion_tokens ?? 0;
        }
      } catch { /* skip */ }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        processLines(buffer.split("\n"));
      }
      break;
    }

    // Stream directly to the frontend immediately!
    await writer.write(value);

    // Parse just to extract the cost metadata silently
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    processLines(lines);
  }

  // Send final done marker
  await writer.write(enc.encode("data: [DONE]\n\n"));
  
  return { cost: streamCost, promptTokens, completionTokens };
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    query,
    models = {},
    image,
    apiKeys: apiKeysRequest = {},
  }: {
    query: string;
    models: Models;
    image?: string;
    apiKeys?: ApiKeysRequest;
  } = body;

  if (!query?.trim()) return Response.json({ error: "Query required" }, { status: 400 });

  // Build API keys configuration from request + environment fallbacks
  const apiKeys: ApiKeysRequest = {
    keys: {},
    customEndpoints: apiKeysRequest.customEndpoints || [],
  };
  // Ensure keys is always an object for type safety
  if (!apiKeys.keys) {
    apiKeys.keys = {};
  }

  // Merge request keys with environment variables as fallback
  const providers: ApiProvider[] = ["openrouter", "deepseek", "openai", "gemini", "anthropic", "serper", "searxng"];
  for (const provider of providers) {
    const requestKey = apiKeysRequest.keys?.[provider];
    if (requestKey?.key) {
      apiKeys.keys[provider] = requestKey;
    } else if (process.env[provider]) {
      apiKeys.keys[provider] = {
        provider,
        key: process.env[provider]!,
      };
    }
  }

  // Check for search provider
  const searchProvider = apiKeys.keys?.serper ? "serper" : apiKeys.keys?.searxng ? "searxng" : null;
  if (!searchProvider && !process.env.serper && !process.env.searxng) {
    return Response.json({ error: "Search API key missing (Serper or SearxNG required)" }, { status: 500 });
  }

  const uniMode = models.uniMode === true;

  const modelRouter   = models.router   || DEFAULT_ROUTER;
  const modelSelector = models.selector || DEFAULT_SELECTOR;
  const modelWriter   = models.writer   || DEFAULT_WRITER;
  const modelUni      = models.uni      || DEFAULT_UNI;

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc    = new TextEncoder();
  const emit   = (obj: object) => writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  (async () => {
    // Running cost accumulator (in USD)
    let totalCost = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // UNI MODE — single model handles everything
      // ═══════════════════════════════════════════════════════════════════════
      if (uniMode) {
        await emit({ type: "status", message: "Analyzing your query…" });

        // Step 1: Route — decide if web search is needed
        const { text: routerText, cost: routerCost, promptTokens: rIP, completionTokens: rOP } = await llm(apiKeys, modelUni, [
          {
            role: "system",
            content: `You are a routing agent for a search engine. Decide if the user query needs real-time web search.
Return ONLY valid JSON, no explanation.

Needs search:    {"needsSearch": true, "searchTerms": ["term 1", "term 2", "term 3"]}
Does not need:   {"needsSearch": false}

needsSearch=true: current events, news, live data, prices, sports, weather, specific products/people/companies, recent releases, anything time-sensitive, or topics where facts matter.
needsSearch=false: math, code, creative writing, translation, general explanations, stable factual concepts.

Generate multiple diverse search terms (up to 4). IMPORTANT: You should include the raw user query as one of the search terms if it's likely to yield high-quality direct results.

Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
          },
          { role: "user", content: query },
        ]);
        totalCost += routerCost;
        totalPromptTokens += rIP;
        totalCompletionTokens += rOP;

        let needsSearch  = false;
        let searchTerms: string[] = [];
        try {
          const r = safeJSON<{ needsSearch: boolean; searchTerms?: string[] }>(routerText);
          needsSearch = r.needsSearch ?? false;
          searchTerms = r.searchTerms ?? [];
        } catch { /* keep defaults */ }

        let finalUserContent = query;
        let sources: { title: string; url: string; snippet: string }[] = [];

        if (needsSearch && searchTerms.length > 0) {
          // Step 2: Search + Scrape
          const preview = searchTerms.slice(0, 2).join(", ");
          await emit({ type: "status", message: `Searching: ${preview}…` });

          // Use appropriate search provider
          let organic: SerperOrganic[] = [];
          if (searchProvider === "serper") {
            organic = await serperSearch(searchTerms, apiKeys.keys?.serper?.key || process.env.serper || "");
          } else if (searchProvider === "searxng") {
            const searxngConfig = apiKeys.keys?.searxng;
            organic = await searxngSearch(searchTerms, searxngConfig?.endpoint || process.env.searxng || "", searxngConfig?.key);
          }

          sources = organic.map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
          await emit({ type: "sources", data: sources });

          // Scrape top 4 results directly (uni mode skips the selector agent)
          const urlsToScrape = organic.slice(0, 4).map((r) => r.link);
          await emit({ type: "status", message: `Reading ${urlsToScrape.length} sources…` });

          let scrapedContext = "";
          let allImages: ScrapedImage[] = [];
          const scraped = await Promise.allSettled(urlsToScrape.map(scrapeUrl));
          scraped.forEach((r, i) => {
            if (r.status === "fulfilled") {
              scrapedContext += `\n\n--- Source: ${urlsToScrape[i]} ---\n${r.value.content}`;
              allImages.push(...(r.value.images ?? []));
            }
          });

          const imageList = allImages.length > 0
            ? `\n\n=== AVAILABLE IMAGES ===\n${allImages.map((img, i) => `${i + 1}. ${img.title}\n   ${img.url}`).join("\n")}\n========================\n\n`
            : "";

          const snippets = organic.map((r, i) => `[${i}] ${r.title}\n${r.snippet}\nURL: ${r.link}`).join("\n\n");
          finalUserContent = `${imageList}=== SEARCH RESULTS SNIPPETS ===\n${snippets}\n\n=== SCRAPED CONTENT ===\n${scrapedContext || "No detailed content available."}\n================================\n\nUser Query: ${query}`;

          await emit({ type: "status", message: "Writing response…" });
          const writerRes = await llmStream(apiKeys, modelUni, [
            { role: "system", content: writerSystemPrompt(allImages.length > 0, false) },
            { role: "user", content: image ? [{ type: "text", text: finalUserContent }, { type: "image_url", image_url: { url: image } }] : finalUserContent },
          ], true);
          const { cost: writerCost, promptTokens: wIP, completionTokens: wOP } = await pipeStreamAndExtractCost(writerRes, writer);
          totalCost += writerCost;
          totalPromptTokens += wIP;
          totalCompletionTokens += wOP;
        } else {
          // Direct answer — no search needed
          await emit({ type: "status", message: "Writing response…" });
          const writerRes = await llmStream(apiKeys, modelUni, [
            {
              role: "system",
              content: `You are Gemma Search, an expert AI assistant. Provide a direct, highly readable, and well-structured answer.

- Write in clear, concise paragraphs. Avoid repetition.
- Use **Bold Headers** and lists to make the text scannable.
- Use tables or charts where very relevant or appropriate.`,
            },
            { role: "user", content: image ? [{ type: "text", text: query }, { type: "image_url", image_url: { url: image } }] : query },
          ], true);
          const { cost: writerCost, promptTokens: wIP, completionTokens: wOP } = await pipeStreamAndExtractCost(writerRes, writer);
          totalCost += writerCost;
          totalPromptTokens += wIP;
          totalCompletionTokens += wOP;
        }

      // Emit aggregated cost for all agents
      await emit({ 
        type: "cost", 
        value: totalCost,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens
      });
        return;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STANDARD 3-AGENT MODE
      // ═══════════════════════════════════════════════════════════════════════

      let scrapedContext  = "";
      let sources: { title: string; url: string; snippet: string }[] = [];
      let writerSystemPromptStr = "";
      let finalUserContent = query;

      // ── Path A: URLs detected in query → scrape directly ─────────────────
      const urlsInQuery = extractUrls(query);

      if (urlsInQuery.length > 0) {
        await emit({ type: "status", message: `Scraping ${urlsInQuery.length} URL${urlsInQuery.length > 1 ? "s" : ""}…` });
        sources = urlsInQuery.map((u) => ({ title: new URL(u).hostname, url: u, snippet: "" }));
        await emit({ type: "sources", data: sources });

        const scraped = await Promise.allSettled(urlsInQuery.map(scrapeUrl));
        let allImages: ScrapedImage[] = [];
        scraped.forEach((r, i) => {
          if (r.status === "fulfilled") {
            scrapedContext += `\n\n--- Source: ${urlsInQuery[i]} ---\n${r.value.content}`;
            allImages.push(...(r.value.images ?? []));
          }
        });

        const imageList = allImages.length > 0
          ? `\n\n=== AVAILABLE IMAGES ===\n${allImages.map((img, i) => `${i + 1}. ${img.title}\n   ${img.url}`).join("\n")}\n========================\n\n`
          : "";

        writerSystemPromptStr = writerSystemPrompt(allImages.length > 0, true);
        finalUserContent = `${imageList}=== URL CONTENT ===\n${scrapedContext}\n================================\n\nUser Query: ${query}`;

      } else {
        // ── Path B: Router decides if web search needed ──────────────────────
        await emit({ type: "status", message: "Analyzing your query…" });

        const { text: routerText, cost: routerCost, promptTokens: rIP, completionTokens: rOP } = await llm(apiKeys, modelRouter, [
          {
            role: "system",
            content: `You are a routing agent for a search engine. Decide if the user query needs real-time web search.
Return ONLY valid JSON, no explanation.

Needs search:    {"needsSearch": true, "searchTerms": ["term 1", "term 2", "term 3"]}
Does not need:   {"needsSearch": false}

needsSearch=true: current events, news, live data, prices, sports, weather, specific products/people/companies, recent releases, anything time-sensitive, or topics where facts matter.
needsSearch=false: math, code, creative writing, translation, general explanations, stable factual concepts.

CRITICAL: Generate multiple diverse search terms (up to 4). You should include the raw user query as one of the search terms if it's likely to yield high-quality direct results.

Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
          },
          { role: "user", content: query },
        ]);
        totalCost += routerCost;
        totalPromptTokens += rIP;
        totalCompletionTokens += rOP;

        let needsSearch  = false;
        let searchTerms: string[] = [];

        try {
          const r = safeJSON<{ needsSearch: boolean; searchTerms?: string[] }>(routerText);
          needsSearch = r.needsSearch ?? false;
          searchTerms = r.searchTerms ?? [];
        } catch { /* keep defaults */ }

        if (needsSearch && searchTerms.length > 0) {
          // ── Search ──────────────────────────────────────────────────────────
          const preview = searchTerms.slice(0, 2).join(", ");
          await emit({ type: "status", message: `Searching: ${preview}…` });

          // Use appropriate search provider
          let organic: SerperOrganic[] = [];
          if (searchProvider === "serper") {
            organic = await serperSearch(searchTerms, apiKeys.keys?.serper?.key || process.env.serper || "");
          } else if (searchProvider === "searxng") {
            const searxngConfig = apiKeys.keys?.searxng;
            organic = await searxngSearch(searchTerms, searxngConfig?.endpoint || process.env.searxng || "", searxngConfig?.key);
          }

          sources = organic.map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
          await emit({ type: "sources", data: sources });

          // ── Selector & Scraper with Fallback ────────────────────────────────
          let scrapedContext = "";
          let allImages: ScrapedImage[] = [];
          const failedUrls = new Set<string>();
          let attempts = 0;

          while (attempts < 2 && !scrapedContext) {
            attempts++;
            await emit({ type: "status", message: attempts > 1 ? "Retrying with alternative sources…" : "Selecting best sources to read…" });

            // Filter out failed URLs from the results shown to Agent 2
            const filteredOrganic = organic.filter(r => !failedUrls.has(r.link));
            if (filteredOrganic.length === 0) break;

            const snippetList = filteredOrganic
              .map((r, i) => `[${i}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
              .join("\n\n");

            const { text: selectorText, cost: selectorCost, promptTokens: sIP, completionTokens: sOP } = await llm(apiKeys, modelSelector, [
              {
                role: "system",
                content: `You are a content-selector agent. Your job is to select only the most relevant and high-quality URLs from the search results that are absolutely essential to answer the user's query.
Be extremely conservative and selective: cherry-pick only the most high-value sources. Do not overpick; focus on quality over quantity. If one site provides a comprehensive answer, only pick that one. Avoid picking similar sites or low-value results.
Return ONLY valid JSON containing the selected URLs: {"urls": ["https://...", "https://..."]}
Do not explain your choices.`,
              },
              { role: "user", content: `Query: ${query}\n\nResults:\n${snippetList}` },
            ]);
            totalCost += selectorCost;
            totalPromptTokens += sIP;
            totalCompletionTokens += sOP;

            let urlsToScrape: string[] = [];
            try {
              const sel = safeJSON<{ urls: string[] }>(selectorText);
              urlsToScrape = (sel.urls ?? []).slice(0, 5);
            } catch {
              urlsToScrape = filteredOrganic.slice(0, 2).map((r) => r.link);
            }

            if (urlsToScrape.length > 0) {
              await emit({ type: "status", message: `Reading ${urlsToScrape.length} source${urlsToScrape.length > 1 ? "s" : ""}…` });
              const scraped = await Promise.allSettled(urlsToScrape.map(scrapeUrl));
              
              let someSuccess = false;
              scraped.forEach((r, i) => {
                if (r.status === "fulfilled") {
                  scrapedContext += `\n\n--- Source: ${urlsToScrape[i]} ---\n${r.value.content}`;
                  allImages.push(...(r.value.images ?? []));
                  someSuccess = true;
                } else {
                  failedUrls.add(urlsToScrape[i]);
                }
              });

              if (someSuccess) break; // We got content!
            } else {
              break; // No URLs selected
            }
          }

          const imageList = allImages.length > 0
            ? `\n\n=== AVAILABLE IMAGES ===\n${allImages.map((img, i) => `${i + 1}. ${img.title}\n   ${img.url}`).join("\n")}\n========================\n\n`
            : "";

          const snippets = organic.map((r, i) => `[${i}] ${r.title}\n${r.snippet}\nURL: ${r.link}`).join("\n\n");
          finalUserContent = `${imageList}=== SEARCH RESULTS SNIPPETS ===\n${snippets}\n\n=== SCRAPED CONTENT ===\n${scrapedContext || "No detailed content available."}\n================================\n\nUser Query: ${query}`;

          // No longer needed as snippets are always included above
          // if (!scrapedContext.trim()) scrapedContext = organic.map(r => r.snippet).join("\n");

          writerSystemPromptStr = writerSystemPrompt(allImages.length > 0, false);

        } else {
          writerSystemPromptStr = `You are Gemma Search, an expert AI assistant. Provide a direct, highly readable, and well-structured answer.

- Write in clear, concise paragraphs. Avoid repetition.
- Use **Bold Headers** and lists to make the text scannable.
- Use tables or charts where very relevant or appropriate.`;
        }
      }

      // ── Writer (streamed) ─────────────────────────────────────────────────
      await emit({ type: "status", message: "Writing response…" });

      const writerUserContent = image
        ? [
            { type: "text", text: finalUserContent },
            { type: "image_url", image_url: { url: image } },
          ]
        : finalUserContent;

      const writerRes = await llmStream(apiKeys, modelWriter, [
        { role: "system", content: writerSystemPromptStr },
        { role: "user",   content: writerUserContent },
      ], true);

      const { cost: writerCost, promptTokens: wIP, completionTokens: wOP } = await pipeStreamAndExtractCost(writerRes, writer);
      totalCost += writerCost;
      totalPromptTokens += wIP;
      totalCompletionTokens += wOP;

      // Emit aggregated cost for all agents
      await emit({ 
        type: "cost", 
        value: totalCost,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens
      });

    } catch (e: unknown) {
      console.error('Chat API Error:', e);
      const errorMessage = e instanceof Error ? e.message : "Unknown error";
      // Include more details for debugging
      await emit({
        type: "error",
        message: errorMessage,
        details: e instanceof Error ? e.stack : undefined
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
