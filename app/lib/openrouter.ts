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

export interface ModelCategory {
  category: string;
  models: Array<{ id: string; label: string }>;
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

// Categorize models into Gemma, Mistral, Qwen, and Free models
export function categorizeModels(models: OpenRouterModel[]): ModelCategory[] {
  const gemmaModels: Array<{ id: string; label: string }> = [];
  const mistralModels: Array<{ id: string; label: string }> = [];
  const qwenModels: Array<{ id: string; label: string }> = [];
  const freeModels: Array<{ id: string; label: string }> = [];

  // Specific Qwen model to always include
  const qwen359b = models.find(m => m.id.includes("qwen") && m.id.includes("3.5") && m.id.includes("9b"));
  if (qwen359b) {
    qwenModels.push({ id: qwen359b.id, label: qwen359b.name || qwen359b.id });
  }

  for (const model of models) {
    const id = model.id.toLowerCase();
    const name = model.name || model.id;

    // Gemma models
    if (id.includes("gemma")) {
      gemmaModels.push({ id: model.id, label: name });
    }

    // Mistral models
    if (id.includes("mistral")) {
      mistralModels.push({ id: model.id, label: name });
    }

    // Qwen models (excluding the one we already added)
    if (id.includes("qwen") && !qwenModels.some(m => m.id === model.id)) {
      qwenModels.push({ id: model.id, label: name });
    }

    // Free models
    if (isFreeModel(model)) {
      freeModels.push({ id: model.id, label: name });
    }
  }

  const categories: ModelCategory[] = [];

  if (gemmaModels.length > 0) {
    categories.push({ category: "Gemma Models", models: gemmaModels });
  }

  if (mistralModels.length > 0) {
    categories.push({ category: "Mistral Models", models: mistralModels });
  }

  if (qwenModels.length > 0) {
    categories.push({ category: "Qwen Models", models: qwenModels });
  }

  if (freeModels.length > 0) {
    categories.push({ category: "Free Models", models: freeModels });
  }

  return categories;
}

// Flatten categories for use in select dropdown
export function flattenModelCategories(categories: ModelCategory[]): Array<{ id: string; label: string }> {
  const result: Array<{ id: string; label: string }> = [];

  for (const category of categories) {
    for (const model of category.models) {
      result.push(model);
    }
  }

  return result;
}
