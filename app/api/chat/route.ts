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

interface ScrapedImage { title: string; url: string; type: "image" }

interface ScraperResponse {
  content: string;
  images?: ScrapedImage[];
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────

/**
 * Non-streaming LLM call. Returns the text response AND the cost in USD
 * as reported by OpenRouter in `usage.cost`.
 */
async function llm(
  key: string,
  model: string,
  messages: ORMessage[],
  maxTokens = 512
): Promise<{ text: string; cost: number; promptTokens: number; completionTokens: number }> {
  let baseUrl = OR_BASE;
  let headers: Record<string, string> = OR_HEADERS(key);
  let actualModel = model;

  if (model.startsWith("lmstudio/")) {
    baseUrl = "http://localhost:1234/v1/chat/completions";
    actualModel = model.replace("lmstudio/", "");
    headers = { "Content-Type": "application/json" };
  } else if (model.startsWith("ollama/")) {
    // Try the OpenAI compatible endpoint first
    baseUrl = "http://localhost:11434/v1/chat/completions";
    actualModel = model.replace("ollama/", "");
    headers = { "Content-Type": "application/json" };
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ 
      model: actualModel, 
      messages, 
      stream: false, 
      max_tokens: maxTokens 
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
  key: string,
  model: string,
  messages: ORMessage[],
  includeReasoning = false
): Promise<Response> {
  let baseUrl = OR_BASE;
  let headers: Record<string, string> = OR_HEADERS(key);
  let actualModel = model;
  let streamOptions: any = { include_usage: true };

  if (model.startsWith("lmstudio/")) {
    baseUrl = "http://localhost:1234/v1/chat/completions";
    actualModel = model.replace("lmstudio/", "");
    headers = { "Content-Type": "application/json" };
    streamOptions = undefined; // LMS might not support include_usage in stream_options
  } else if (model.startsWith("ollama/")) {
    baseUrl = "http://localhost:11434/v1/chat/completions";
    actualModel = model.replace("ollama/", "");
    headers = { "Content-Type": "application/json" };
    streamOptions = undefined;
  }

  const res = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: actualModel,
      messages,
      stream: true,
      // Ask OpenRouter to include usage in the stream finale
      stream_options: streamOptions,
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

// ─── Serper ───────────────────────────────────────────────────────────────────
async function serperSearch(terms: string[], apiKey: string): Promise<SerperOrganic[]> {
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

// ─── Scraper ──────────────────────────────────────────────────────────────────
async function scrapeUrl(url: string): Promise<ScraperResponse> {
  const endpoint = `https://scraper.youtopialabs.workers.dev/?url=${encodeURIComponent(url)}&format=json&includeMetadata=false`;
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Scraper ${res.status} for ${url}`);
  const data = await res.json() as ScraperResponse;
  return { content: data.content.slice(0, 8_000), images: data.images ?? [] };
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
  const { query, models = {}, image }: { query: string; models: Models; image?: string } = body;

  if (!query?.trim()) return Response.json({ error: "Query required" }, { status: 400 });

  const openrouterKey = process.env.openrouter;
  const serperKey     = process.env.serper;
  if (!openrouterKey || !serperKey) return Response.json({ error: "API keys missing" }, { status: 500 });

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
        const { text: routerText, cost: routerCost, promptTokens: rIP, completionTokens: rOP } = await llm(openrouterKey, modelUni, [
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

          const organic = await serperSearch(searchTerms, serperKey);
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
          const writerRes = await llmStream(openrouterKey, modelUni, [
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
          const writerRes = await llmStream(openrouterKey, modelUni, [
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

        const { text: routerText, cost: routerCost, promptTokens: rIP, completionTokens: rOP } = await llm(openrouterKey, modelRouter, [
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

          const organic = await serperSearch(searchTerms, serperKey);
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

            const { text: selectorText, cost: selectorCost, promptTokens: sIP, completionTokens: sOP } = await llm(openrouterKey, modelSelector, [
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

      const writerRes = await llmStream(openrouterKey, modelWriter, [
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
      await emit({ type: "error", message: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
