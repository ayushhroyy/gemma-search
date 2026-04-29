// ─── OpenRouter Models API ───────────────────────────────────────────────────────

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

// Fetch all models from OpenRouter
export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Failed to fetch OpenRouter models:", error);
    return [];
  }
}

// Check if a model is free (pricing.prompt and pricing.completion are "0")
export function isFreeModel(model: OpenRouterModel): boolean {
  const promptPrice = parseFloat(model.pricing?.prompt || "0");
  const completionPrice = parseFloat(model.pricing?.completion || "0");
  return promptPrice === 0 && completionPrice === 0;
}

// Get only free models from OpenRouter
export async function fetchFreeModels(): Promise<Array<{ id: string; label: string }>> {
  const models = await fetchOpenRouterModels();
  const freeModels = models.filter(isFreeModel);

  return freeModels.map(model => ({
    id: model.id,
    label: model.name || model.id,
  }));
}
