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
      try {
        const res = await fetch("/api/local-models");
        if (res.ok) {
          const data = await res.json();
          setLocalModels(data);
        }
      } catch {
        // API unavailable or error
        setLocalModels([]);
      }
    }

    detectModels();
    // Poll every 30 seconds to refresh the list
    const interval = setInterval(detectModels, 30000);
    return () => clearInterval(interval);
  }, []);

  return localModels;
}
