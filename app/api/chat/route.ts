import { NextRequest } from "next/server";

export const runtime = "edge";

interface SerperOrganic {
  title: string;
  link: string;
  snippet: string;
}

interface SerperResponse {
  organic?: SerperOrganic[];
}

async function searchWeb(query: string, apiKey: string): Promise<SerperOrganic[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 6 }),
  });

  if (!res.ok) throw new Error(`Serper error: ${res.status}`);
  const data: SerperResponse = await res.json();
  return data.organic?.slice(0, 5) ?? [];
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();

    if (!query?.trim()) {
      return Response.json({ error: "Query is required" }, { status: 400 });
    }

    const openrouterKey = process.env.openrouter;
    const serperKey = process.env.serper;

    if (!openrouterKey || !serperKey) {
      return Response.json({ error: "API keys not configured" }, { status: 500 });
    }

    // 1. Web search
    const organic = await searchWeb(query, serperKey);

    const sources = organic.map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
    }));

    const contextText = organic
      .map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`)
      .join("\n\n");

    // 2. Stream from OpenRouter
    const llmRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://gemma-search.pages.dev",
        "X-Title": "Gemma Search",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it",
        stream: true,
        messages: [
          {
            role: "system",
            content: `You are Gemma Search, an intelligent AI research assistant. Use the web search results below to answer the user's question accurately and thoroughly.

Search Results:
${contextText}

Format your response using **Bold Headers** for sections, bullet points with *, and numbered lists where appropriate. Be thorough but concise.`,
          },
          { role: "user", content: query },
        ],
      }),
    });

    if (!llmRes.ok) {
      const err = await llmRes.text();
      return Response.json({ error: `LLM error: ${err}` }, { status: 500 });
    }

    // 3. Stream: emit sources first, then proxy the LLM stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        // Emit sources as the first SSE event
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: "sources", data: sources })}\n\n`)
        );

        // Proxy LLM stream chunks directly
        const reader = llmRes.body!.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(value);
        }
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
