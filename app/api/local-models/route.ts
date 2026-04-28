import { NextResponse } from "next/server";

export const runtime = 'edge';

export interface LocalModel {
  id: string;
  label: string;
  provider: "lmstudio" | "ollama";
}

const LM_STUDIO_URL = "http://localhost:1234/v1/models";
const OLLAMA_URL = "http://localhost:11434/api/tags";
const TIMEOUT_MS = 2000;

async function fetchWithTimeout(url: string, timeout: number): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function GET() {
  const discovered: LocalModel[] = [];

  // 1. Detect LM Studio
  const lmsRes = await fetchWithTimeout(LM_STUDIO_URL, TIMEOUT_MS);
  if (lmsRes && lmsRes.ok) {
    try {
      const data = await lmsRes.json();
      if (data && Array.isArray(data.data)) {
        data.data.forEach((m: any) => {
          discovered.push({
            id: `lmstudio/${m.id}`,
            label: `LMS: ${m.id.split("/").pop() || m.id}`,
            provider: "lmstudio",
          });
        });
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // 2. Detect Ollama
  const ollamaRes = await fetchWithTimeout(OLLAMA_URL, TIMEOUT_MS);
  if (ollamaRes && ollamaRes.ok) {
    try {
      const data = await ollamaRes.json();
      if (data && Array.isArray(data.models)) {
        data.models.forEach((m: any) => {
          discovered.push({
            id: `ollama/${m.name}`,
            label: `Ollama: ${m.name}`,
            provider: "ollama",
          });
        });
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  return NextResponse.json(discovered);
}
