/**
 * @intentflow/ai
 * AI & Embedding Provider Infrastructure
 */

export interface ProductSemanticInput {
  name: string;
  description?: string | null;
  brand?: string | null;
  category?: { name: string } | string | null;
  tags?: string[] | null;
  specifications?: unknown;
  deliveryInfo?: string | null;
  returnPolicy?: string | null;
  [key: string]: unknown;
}

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embedText(text: string): Promise<number[]>;
  embedProduct(product: ProductSemanticInput): Promise<number[]>;
}

export interface OpenAIEmbeddingProviderOptions {
  apiKey?: string;
  model?: string;
  dimensions?: number;
  timeoutMs?: number;
  baseUrl?: string;
}

/**
 * Builds semantic text representation for product embeddings.
 * Stricly includes: name, brand, category, description, tags, specifications, deliveryInfo, returnPolicy.
 * Stricly excludes: price, currency, stock, inventory counts, SKU, credentials.
 */
export function buildProductEmbeddingText(product: ProductSemanticInput): string {
  const parts: string[] = [];

  if (product.name && typeof product.name === "string" && product.name.trim()) {
    parts.push(`Product: ${product.name.trim()}`);
  }

  if (product.brand && typeof product.brand === "string" && product.brand.trim()) {
    parts.push(`Brand: ${product.brand.trim()}`);
  }

  if (product.category) {
    const categoryName =
      typeof product.category === "string"
        ? product.category.trim()
        : product.category.name?.trim();
    if (categoryName) {
      parts.push(`Category: ${categoryName}`);
    }
  }

  if (product.description && typeof product.description === "string" && product.description.trim()) {
    parts.push(`Description: ${product.description.trim()}`);
  }

  if (Array.isArray(product.tags) && product.tags.length > 0) {
    const validTags = product.tags
      .filter((t) => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim());
    if (validTags.length > 0) {
      parts.push(`Tags: ${validTags.join(", ")}`);
    }
  }

  if (
    product.specifications &&
    typeof product.specifications === "object" &&
    !Array.isArray(product.specifications) &&
    Object.keys(product.specifications).length > 0
  ) {
    const specEntries = Object.entries(product.specifications)
      .filter(([k, v]) => k && v !== undefined && v !== null)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    if (specEntries.length > 0) {
      parts.push(`Specifications: ${specEntries.join("; ")}`);
    }
  }

  if (product.deliveryInfo && typeof product.deliveryInfo === "string" && product.deliveryInfo.trim()) {
    parts.push(`Delivery Info: ${product.deliveryInfo.trim()}`);
  }

  if (product.returnPolicy && typeof product.returnPolicy === "string" && product.returnPolicy.trim()) {
    parts.push(`Return Policy: ${product.returnPolicy.trim()}`);
  }

  return parts.join("\n");
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: OpenAIEmbeddingProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
    this.dimensions = options.dimensions ?? 1536;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      throw new Error("OpenAI API key is missing. Set OPENAI_API_KEY in environment variables.");
    }

    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("Cannot embed empty text.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: trimmed,
          dimensions: this.dimensions,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Unknown error");
        throw new Error(`OpenAI embedding API failed with status ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding: number[] }>;
      };

      if (!data.data || !data.data[0] || !Array.isArray(data.data[0].embedding)) {
        throw new Error("Invalid response format received from OpenAI embedding API.");
      }

      const embedding = data.data[0].embedding;
      if (embedding.length !== this.dimensions) {
        throw new Error(
          `Unexpected embedding dimensions. Expected ${this.dimensions}, got ${embedding.length}.`
        );
      }

      return embedding;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`OpenAI embedding request timed out after ${this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async embedProduct(product: ProductSemanticInput): Promise<number[]> {
    const text = buildProductEmbeddingText(product);
    return this.embedText(text);
  }
}
