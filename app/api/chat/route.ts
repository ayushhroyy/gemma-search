import { NextRequest } from "next/server";

export const runtime = "edge";

// ─── Defaults ─────────────────────────────────────────────────────────────────
const DEFAULT_ROUTER   = "google/gemma-4-31b-it";
const DEFAULT_SELECTOR = "google/gemma-4-26b-a4b-it";
const DEFAULT_WRITER   = "google/gemma-4-31b-it";

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
interface Models { router?: string; selector?: string; writer?: string }

// ─── LLM helpers ─────────────────────────────────────────────────────────────

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

async function llmStream(key: string, model: string, messages: ORMessage[]): Promise<Response> {
  const res = await fetch(OR_BASE, {
    method: "POST",
    headers: OR_HEADERS(key),
    body: JSON.stringify({ model, messages, stream: true }),
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
async function scrapeUrl(url: string): Promise<string> {
  const endpoint = `https://scraper.youtopialabs.workers.dev/?url=${encodeURIComponent(url)}&format=text&includeMetadata=false`;
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Scraper ${res.status} for ${url}`);
  return (await res.text()).slice(0, 8_000);
}

// Extract URLs from user query text
function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  // Strip trailing punctuation
  return [...new Set(matches.map((u) => u.replace(/[.,!?)]+$/, "")))];
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { query, models = {} }: { query: string; models: Models } = body;

  if (!query?.trim()) return Response.json({ error: "Query required" }, { status: 400 });

  const openrouterKey = process.env.openrouter;
  const serperKey     = process.env.serper;
  if (!openrouterKey || !serperKey) return Response.json({ error: "API keys missing" }, { status: 500 });

  const modelRouter   = models.router   || DEFAULT_ROUTER;
  const modelSelector = models.selector || DEFAULT_SELECTOR;
  const modelWriter   = models.writer   || DEFAULT_WRITER;

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc    = new TextEncoder();
  const emit   = (obj: object) => writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

  (async () => {
    try {
      let scrapedContext  = "";
      let sources: { title: string; url: string; snippet: string }[] = [];
      let writerPrompt    = "";

      // ── Path A: URLs detected in query → scrape directly ─────────────────
      const urlsInQuery = extractUrls(query);

      if (urlsInQuery.length > 0) {
        await emit({ type: "status", message: `Scraping ${urlsInQuery.length} URL${urlsInQuery.length > 1 ? "s" : ""}…` });
        sources = urlsInQuery.map((u) => ({ title: new URL(u).hostname, url: u, snippet: "" }));
        await emit({ type: "sources", data: sources });

        const scraped = await Promise.allSettled(urlsInQuery.map(scrapeUrl));
        scraped.forEach((r, i) => {
          if (r.status === "fulfilled") {
            scrapedContext += `\n\n--- Source: ${urlsInQuery[i]} ---\n${r.value}`;
          }
        });

        writerPrompt = `You are Gemma Search. The user shared the following URL content to analyze:\n${scrapedContext}\n\nAnswer the user's question based on this content. Use **Bold Headers**, bullet points, and numbered lists where appropriate.`;

      } else {
        // ── Path B: Router decides if web search needed ──────────────────────
        await emit({ type: "status", message: "Analyzing your query…" });

        const routerText = await llm(openrouterKey, modelRouter, [
          {
            role: "system",
            content: `You are a routing agent. Decide if the user query needs real-time web search.
Return ONLY valid JSON, no explanation.

Needs search:    {"needsSearch": true, "searchTerms": ["term 1", "term 2", "term 3"]}
Does not need:   {"needsSearch": false}

needsSearch=true: current events, news, live data, prices, sports, weather, specific products/people/companies, recent releases, anything time-sensitive.
needsSearch=false: math, code, creative writing, translation, general explanations, stable factual concepts.

You may return up to 4 distinct search terms to cover different aspects of the query.`,
          },
          { role: "user", content: query },
        ]);

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

          const selectorText = await llm(openrouterKey, modelSelector, [
            {
              role: "system",
              content: `You are a content-selector agent. Choose 2–3 URLs most likely to contain the full answer.
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

          // ── Scrape ──────────────────────────────────────────────────────────
          if (urlsToScrape.length > 0) {
            await emit({ type: "status", message: `Reading ${urlsToScrape.length} source${urlsToScrape.length > 1 ? "s" : ""}…` });
            const scraped = await Promise.allSettled(urlsToScrape.map(scrapeUrl));
            scraped.forEach((r, i) => {
              if (r.status === "fulfilled") {
                scrapedContext += `\n\n--- Source: ${urlsToScrape[i]} ---\n${r.value}`;
              }
            });
          }

          // Fallback to snippets if all scrapes failed
          if (!scrapedContext.trim()) scrapedContext = snippetList;

          writerPrompt = `You are Gemma Search, an intelligent AI research assistant. Use the web sources below to answer accurately and comprehensively.

${scrapedContext}

Format your response with **Bold Headers**, bullet points, and numbered lists where appropriate. Cite sources naturally. Be thorough but concise.`;

        } else {
          writerPrompt = `You are Gemma Search, an intelligent AI assistant. Answer the user's question clearly and thoroughly.
Format your response with **Bold Headers**, bullet points, and numbered lists where appropriate.`;
        }
      }

      // ── Writer (streamed) ─────────────────────────────────────────────────
      await emit({ type: "status", message: "Writing response…" });

      const writerRes = await llmStream(openrouterKey, modelWriter, [
        { role: "system", content: writerPrompt },
        { role: "user",   content: query },
      ]);

      const reader = writerRes.body!.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
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
