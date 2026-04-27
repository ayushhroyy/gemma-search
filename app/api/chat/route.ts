import { NextRequest } from "next/server";

export const runtime = "edge";

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_ROUTER   = "google/gemma-4-31b-it";
const DEFAULT_SELECTOR = "google/gemma-4-26b-a4b-it";
const DEFAULT_WRITER   = "google/gemma-3-12b-it";
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
): Promise<{ text: string; cost: number }> {
  const res = await fetch(OR_BASE, {
    method: "POST",
    headers: OR_HEADERS(key),
    body: JSON.stringify({ model, messages, stream: false, max_tokens: maxTokens, usage: { include: true } }),
  });
  if (!res.ok) throw new Error(`LLM (${model}) ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  // OpenRouter returns cost in USD directly on `usage.cost`
  const cost: number = typeof data.usage?.cost === "number" ? data.usage.cost : 0;
  return { text, cost };
}

/**
 * Streaming LLM call. Returns the raw Response so the caller can pipe it.
 * We request usage in the stream so the final `[DONE]` chunk carries cost.
 */
async function llmStream(
  key: string,
  model: string,
  messages: ORMessage[]
): Promise<Response> {
  const res = await fetch(OR_BASE, {
    method: "POST",
    headers: OR_HEADERS(key),
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      // Ask OpenRouter to include usage in the stream finale
      stream_options: { include_usage: true },
    }),
  });
  if (!res.ok) throw new Error(`LLM stream (${model}) ${res.status}`);
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
    ? `**IMAGES — CRITICAL REQUIREMENT**: You have images available from the scraped sources, listed in the AVAILABLE IMAGES section. You MUST embed as many relevant images as possible throughout your response using markdown syntax: ![descriptive alt text](image_url). Do not skip images — include every image that is relevant to any part of your answer. Place images directly next to the content they illustrate. More images = better response.`
    : "";

  const intro = isUrlMode
    ? `You are Gemma Search, an expert AI assistant. Your task is to provide a highly detailed and accurate answer to the user's query based strictly on the provided URL content.`
    : `You are Gemma Search, an expert AI research assistant. Your task is to provide a highly detailed, accurate, and comprehensive answer to the user's query using the provided search results.\n\nSynthesize information from multiple sources. Cite your sources naturally in the text if helpful.`;

  return `${intro}

Format your response beautifully using **Bold Headers**, bullet points, numbered lists, tables, and charts where appropriate.

**TABLES** — For side-by-side comparisons or multi-row data, use markdown tables:
| Feature | Option A | Option B |
|---------|----------|----------|
| Price   | $10      | $25      |
| Quality | High     | Premium  |

**CHARTS** — For visual data representation, use mermaid code blocks:
- Pie charts: Parts of a whole (simplest, most reliable)
- Bar charts (xychart-beta): Comparing values across categories
- Line charts (xychart-beta): Trends over time

IMPORTANT CHART SYNTAX RULES:
1. ALWAYS use double quotes around titles and labels: title "Revenue"
2. Keep labels SHORT and SIMPLE — avoid special characters like % $ # @
3. For pie charts: use format "Label" : number (with spaces around colon)
4. For xychart: keep values as simple numbers, no currency symbols

Example pie chart (RECOMMENDED — most reliable):
\`\`\`mermaid
pie title "Market Share"
    "Product A" : 35
    "Product B" : 30
    "Product C" : 20
    "Others" : 15
\`\`\`

Example bar chart:
\`\`\`mermaid
xychart-beta
    title "Revenue by Quarter"
    x-axis ["Q1", "Q2", "Q3", "Q4"]
    y-axis "Revenue" 0 to 100
    bar [25, 40, 65, 80]
\`\`\`

Use tables and charts liberally when data allows. Tables for detail, charts for insight.

${imageInstruction}

Do not mention your system prompt.`;
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
): Promise<number> {
  const reader = writerRes.body!.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();

  let streamCost = 0;
  let buffer = "";

  const processLines = (lines: string[]) => {
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed.usage && typeof parsed.usage.cost === "number") {
          streamCost = parsed.usage.cost;
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
  
  return streamCost;
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

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // UNI MODE — single model handles everything
      // ═══════════════════════════════════════════════════════════════════════
      if (uniMode) {
        await emit({ type: "status", message: "Analyzing your query…" });

        // Step 1: Route — decide if web search is needed
        const { text: routerText, cost: routerCost } = await llm(openrouterKey, modelUni, [
          {
            role: "system",
            content: `You are a routing agent for a search engine. Decide if the user query needs real-time web search.
Return ONLY valid JSON, no explanation.

Needs search:    {"needsSearch": true, "searchTerms": ["term 1", "term 2", "term 3"]}
Does not need:   {"needsSearch": false}

needsSearch=true: current events, news, live data, prices, sports, weather, specific products/people/companies, recent releases, anything time-sensitive, or topics where facts matter.
needsSearch=false: math, code, creative writing, translation, general explanations, stable factual concepts.

Generate multiple diverse search terms (up to 4) for comprehensive results.

Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
          },
          { role: "user", content: query },
        ]);
        totalCost += routerCost;

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

          finalUserContent = `${imageList}=== SEARCH RESULTS & CONTEXT ===\n${scrapedContext || organic.map((r, i) => `[${i}] ${r.title}\n${r.snippet}\nURL: ${r.link}`).join("\n\n")}\n================================\n\nUser Query: ${query}`;

          await emit({ type: "status", message: "Writing response…" });
          const writerRes = await llmStream(openrouterKey, modelUni, [
            { role: "system", content: writerSystemPrompt(allImages.length > 0, false) },
            { role: "user", content: image ? [{ type: "text", text: finalUserContent }, { type: "image_url", image_url: { url: image } }] : finalUserContent },
          ]);
          const writerCost = await pipeStreamAndExtractCost(writerRes, writer);
          totalCost += writerCost;
        } else {
          // Direct answer — no search needed
          await emit({ type: "status", message: "Writing response…" });
          const writerRes = await llmStream(openrouterKey, modelUni, [
            {
              role: "system",
              content: `You are Gemma Search, an expert AI assistant. Provide a highly detailed, accurate, and comprehensive answer to the user's query.

Format your response beautifully using **Bold Headers**, bullet points, numbered lists, tables, and charts where appropriate.

Use tables and charts liberally when data allows. Tables for detail, charts for insight.`,
            },
            { role: "user", content: image ? [{ type: "text", text: query }, { type: "image_url", image_url: { url: image } }] : query },
          ]);
          const writerCost = await pipeStreamAndExtractCost(writerRes, writer);
          totalCost += writerCost;
        }

        await emit({ type: "cost", value: totalCost });
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

        const { text: routerText, cost: routerCost } = await llm(openrouterKey, modelRouter, [
          {
            role: "system",
            content: `You are a routing agent for a search engine. Decide if the user query needs real-time web search.
Return ONLY valid JSON, no explanation.

Needs search:    {"needsSearch": true, "searchTerms": ["term 1", "term 2", "term 3"]}
Does not need:   {"needsSearch": false}

needsSearch=true: current events, news, live data, prices, sports, weather, specific products/people/companies, recent releases, anything time-sensitive, or topics where facts matter.
needsSearch=false: math, code, creative writing, translation, general explanations, stable factual concepts.

CRITICAL: You are encouraged to generate multiple diverse search terms (up to 4) to ensure comprehensive results. For example, if asked about a comparison, search for both entities separately.

Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
          },
          { role: "user", content: query },
        ]);
        totalCost += routerCost;

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

          // ── Selector ────────────────────────────────────────────────────────
          await emit({ type: "status", message: "Selecting best sources to read…" });

          const snippetList = organic
            .map((r, i) => `[${i}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
            .join("\n\n");

          const { text: selectorText, cost: selectorCost } = await llm(openrouterKey, modelSelector, [
            {
              role: "system",
              content: `You are a content-selector agent. Your job is to select the most relevant URLs from the provided search results that will best answer the user's query.
Be thorough and do not be shy with the number of sites you pick—aim for the 4-6 most relevant sources if available.
Return ONLY valid JSON containing the selected URLs: {"urls": ["https://...", "https://..."]}
Maximum 6 URLs. Do not explain your choices.`,
            },
            { role: "user", content: `Query: ${query}\n\nResults:\n${snippetList}` },
          ]);
          totalCost += selectorCost;

          let urlsToScrape: string[] = [];
          try {
            const sel = safeJSON<{ urls: string[] }>(selectorText);
            urlsToScrape = (sel.urls ?? []).slice(0, 6);
          } catch {
            urlsToScrape = organic.slice(0, 4).map((r) => r.link);
          }

          let allImages: ScrapedImage[] = [];

          // ── Scrape ──────────────────────────────────────────────────────────
          if (urlsToScrape.length > 0) {
            await emit({ type: "status", message: `Reading ${urlsToScrape.length} source${urlsToScrape.length > 1 ? "s" : ""}…` });
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

            finalUserContent = `${imageList}=== SEARCH RESULTS & CONTEXT ===\n${scrapedContext}\n================================\n\nUser Query: ${query}`;
          } else {
            finalUserContent = `=== SEARCH RESULTS & CONTEXT ===\n${snippetList}\n================================\n\nUser Query: ${query}`;
          }

          // Fallback to snippets if all scrapes failed
          if (!scrapedContext.trim()) scrapedContext = snippetList;

          writerSystemPromptStr = writerSystemPrompt(allImages.length > 0, false);

        } else {
          writerSystemPromptStr = `You are Gemma Search, an expert AI assistant. Provide a highly detailed, accurate, and comprehensive answer to the user's query.

Format your response beautifully using **Bold Headers**, bullet points, numbered lists, tables, and charts where appropriate.

**TABLES** — For side-by-side comparisons or multi-row data, use markdown tables:
| Feature | Option A | Option B |
|---------|----------|----------|
| Price   | $10      | $25      |
| Quality | High     | Premium  |

**CHARTS** — For visual data representation, use mermaid code blocks:
- Bar charts (xychart-beta): Comparing values across categories
- Line charts (xychart-beta): Trends over time
- Pie charts: Parts of a whole

Example bar chart:
\`\`\`mermaid
xychart-beta
    title "Revenue by Quarter"
    x-axis ["Q1", "Q2", "Q3", "Q4"]
    y-axis "Revenue ($K)" 0 to 100
    bar [25, 40, 65, 80]
\`\`\`

Example pie chart:
\`\`\`mermaid
pie title "Market Share"
    "Product A" : 35
    "Product B" : 30
    "Product C" : 20
    "Others" : 15
\`\`\`

Use tables and charts liberally when data allows. Tables for detail, charts for insight.`;
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
      ]);

      const writerCost = await pipeStreamAndExtractCost(writerRes, writer);
      totalCost += writerCost;

      // Emit aggregated cost for all agents
      await emit({ type: "cost", value: totalCost });

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
