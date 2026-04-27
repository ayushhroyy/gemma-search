import { NextRequest } from "next/server";

export const runtime = "edge";

// ─── Models ───────────────────────────────────────────────────────────────────
const MODEL_ROUTER   = "google/gemma-4-31b-it";
const MODEL_SELECTOR = "google/gemma-4-26b-a4b-it";
const MODEL_WRITER   = "mistralai/mistral-small-3.2-24b-instruct";

const OR_BASE    = "https://openrouter.ai/api/v1/chat/completions";
const OR_HEADERS = (key: string) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://gemma-search.pages.dev",
  "X-Title": "Gemma Search",
});

// ─── Types ────────────────────────────────────────────────────────────────────
interface ORMessage { role: string; content: string }

interface SerperOrganic { title: string; link: string; snippet: string }

// ─── LLM helpers ─────────────────────────────────────────────────────────────

/** One-shot, non-streaming call. Returns raw text content. */
async function llm(key: string, model: string, messages: ORMessage[]): Promise<string> {
  const res = await fetch(OR_BASE, {
    method: "POST",
    headers: OR_HEADERS(key),
    body: JSON.stringify({ model, messages, stream: false, max_tokens: 512 }),
  });
  if (!res.ok) throw new Error(`LLM (${model}) ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Streaming call. Returns the raw Response to proxy. */
async function llmStream(key: string, model: string, messages: ORMessage[]): Promise<Response> {
  const res = await fetch(OR_BASE, {
    method: "POST",
    headers: OR_HEADERS(key),
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) throw new Error(`LLM stream (${model}) ${res.status}`);
  return res;
}

/** Safely extract JSON from LLM output (handles markdown fences). */
function safeJSON<T>(text: string): T {
  const s = text.replace(/```(?:json)?\n?/g, "").trim();
  const start = s.search(/[{[]/);
  const end   = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (start === -1 || end === -1) throw new Error("No JSON");
  return JSON.parse(s.slice(start, end + 1)) as T;
}

// ─── Serper ───────────────────────────────────────────────────────────────────
async function serperSearch(terms: string[], apiKey: string): Promise<SerperOrganic[]> {
  const results = await Promise.all(
    terms.slice(0, 3).map(async (q) => {
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

  // Deduplicate by URL
  const seen = new Set<string>();
  const out: SerperOrganic[] = [];
  for (const batch of results) {
    for (const r of batch) {
      if (!seen.has(r.link)) { seen.add(r.link); out.push(r); }
    }
  }
  return out.slice(0, 8);
}

// ─── Scraper ──────────────────────────────────────────────────────────────────
async function scrapeUrl(url: string): Promise<string> {
  const endpoint = `https://scraper.youtopialabs.workers.dev/?url=${encodeURIComponent(url)}&format=text&includeMetadata=false`;
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Scraper ${res.status}`);
  return (await res.text()).slice(0, 8_000); // cap per page
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query?.trim()) return Response.json({ error: "Query required" }, { status: 400 });

  const openrouterKey = process.env.openrouter;
  const serperKey     = process.env.serper;
  if (!openrouterKey || !serperKey) return Response.json({ error: "API keys missing" }, { status: 500 });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc    = new TextEncoder();

  /** Write a custom SSE event object */
  const emit = (obj: object) => writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  (async () => {
    try {
      // ── 1. Router ─────────────────────────────────────────────────────────
      await emit({ type: "status", message: "Analyzing your query…" });

      const routerText = await llm(openrouterKey, MODEL_ROUTER, [
        {
          role: "system",
          content: `You are a routing agent. Decide if the user query requires real-time web search.
Return ONLY valid JSON, no explanation, no markdown.

If web search needed:  {"needsSearch": true, "searchTerms": ["term 1", "term 2"]}
If not needed:         {"needsSearch": false}

Use needsSearch=true for: current events, news, live data, prices, sports, weather, specific products/people/companies, recent releases.
Use needsSearch=false for: math, code, creative writing, translation, general explanations, stable factual concepts.`,
        },
        { role: "user", content: query },
      ]);

      let needsSearch  = false;
      let searchTerms: string[] = [];

      try {
        const r = safeJSON<{ needsSearch: boolean; searchTerms?: string[] }>(routerText);
        needsSearch  = r.needsSearch ?? false;
        searchTerms  = r.searchTerms ?? [];
      } catch { /* keep defaults */ }

      let scrapedContext  = "";
      let sources: { title: string; url: string; snippet: string }[] = [];

      if (needsSearch && searchTerms.length > 0) {
        // ── 2. Search ───────────────────────────────────────────────────────
        await emit({ type: "status", message: `Searching: ${searchTerms.slice(0, 2).join(", ")}…` });

        const organic = await serperSearch(searchTerms, serperKey);
        sources = organic.map((r) => ({ title: r.title, url: r.link, snippet: r.snippet }));
        await emit({ type: "sources", data: sources });

        // ── 3. Selector ─────────────────────────────────────────────────────
        await emit({ type: "status", message: "Selecting best sources to read…" });

        const snippetList = organic
          .map((r, i) => `[${i}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
          .join("\n\n");

        const selectorText = await llm(openrouterKey, MODEL_SELECTOR, [
          {
            role: "system",
            content: `You are a content-selector agent. Given search snippets, choose 2–3 URLs most likely to contain the full answer.
Return ONLY valid JSON: {"urls": ["https://...", "https://..."]}
Max 3 URLs. No explanation.`,
          },
          { role: "user", content: `Query: ${query}\n\nResults:\n${snippetList}` },
        ]);

        let urlsToScrape: string[] = [];
        try {
          const sel = safeJSON<{ urls: string[] }>(selectorText);
          urlsToScrape = (sel.urls ?? []).slice(0, 3);
        } catch {
          urlsToScrape = organic.slice(0, 2).map((r) => r.link);
        }

        // ── 4. Scrape ───────────────────────────────────────────────────────
        if (urlsToScrape.length > 0) {
          await emit({ type: "status", message: `Reading ${urlsToScrape.length} source${urlsToScrape.length > 1 ? "s" : ""}…` });

          const scraped = await Promise.allSettled(urlsToScrape.map(scrapeUrl));
          scraped.forEach((r, i) => {
            if (r.status === "fulfilled") {
              scrapedContext += `\n\n--- Source: ${urlsToScrape[i]} ---\n${r.value}`;
            }
          });
        }

        // Fallback to snippets if scraping all failed
        if (!scrapedContext.trim()) scrapedContext = snippetList;
      }

      // ── 5. Writer (streamed) ───────────────────────────────────────────────
      await emit({ type: "status", message: "Writing response…" });

      const systemPrompt = needsSearch
        ? `You are Gemma Search, an intelligent AI research assistant. Use the web sources below to answer accurately and comprehensively.

${scrapedContext}

Format your response with **Bold Headers**, bullet points, and numbered lists where appropriate. Cite sources naturally. Be thorough but concise.`
        : `You are Gemma Search, an intelligent AI assistant. Answer the user's question clearly and thoroughly.
Format your response with **Bold Headers**, bullet points, and numbered lists where appropriate.`;

      const writerRes = await llmStream(openrouterKey, MODEL_WRITER, [
        { role: "system", content: systemPrompt },
        { role: "user",   content: query },
      ]);

      // Proxy the writer stream directly
      const reader = writerRes.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await emit({ type: "error", message: msg });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
