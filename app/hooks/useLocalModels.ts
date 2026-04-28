import { useState, useEffect } from "react";

export interface LocalModel {
  id: string;
  label: string;
  provider: "lmstudio" | "ollama";
}

export function useLocalModels() {
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);

  useEffect(() => {
    async function detectModels() {
      const discovered: LocalModel[] = [];

      // 1. Detect LM Studio
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const res = await fetch("http://localhost:1234/v1/models", {
          mode: "cors",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.data)) {
            data.data.forEach((m: any) => {
              discovered.push({
                id: `lmstudio/${m.id}`,
                label: `LMS: ${m.id.split("/").pop() || m.id}`,
                provider: "lmstudio",
              });
            });
          }
        }
      } catch (e) {
        // LMS not running or CORS blocked
      }

      // 2. Detect Ollama
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const res = await fetch("http://localhost:11434/api/tags", {
          mode: "cors",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.models)) {
            data.models.forEach((m: any) => {
              discovered.push({
                id: `ollama/${m.name}`,
                label: `Ollama: ${m.name}`,
                provider: "ollama",
              });
            });
          }
        }
      } catch (e) {
        // Ollama not running or CORS blocked
      }

      setLocalModels(discovered);
    }

    detectModels();
    // Poll every 30 seconds to refresh the list
    const interval = setInterval(detectModels, 30000);
    return () => clearInterval(interval);
  }, []);

  return localModels;
}
