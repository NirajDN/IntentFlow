/**
 * @intentflow/ai
 * AI & Embedding Provider Infrastructure
 */

import { GoogleGenAI } from "@google/genai";

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

export interface GeminiEmbeddingProviderOptions {
  apiKey?: string;
  model?: string;
  dimensions?: number;
}

/**
 * Builds semantic text representation for product embeddings.
 *
 * Includes:
 * - name
 * - brand
 * - category
 * - description
 * - tags
 * - specifications
 * - deliveryInfo
 * - returnPolicy
 *
 * Excludes:
 * - price
 * - currency
 * - stock
 * - inventory counts
 * - SKU
 * - credentials
 */
export function buildProductEmbeddingText(
  product: ProductSemanticInput
): string {
  const parts: string[] = [];

  if (
    product.name &&
    typeof product.name === "string" &&
    product.name.trim()
  ) {
    parts.push(`Product: ${product.name.trim()}`);
  }

  if (
    product.brand &&
    typeof product.brand === "string" &&
    product.brand.trim()
  ) {
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

  if (
    product.description &&
    typeof product.description === "string" &&
    product.description.trim()
  ) {
    parts.push(`Description: ${product.description.trim()}`);
  }

  if (Array.isArray(product.tags) && product.tags.length > 0) {
    const validTags = product.tags
      .filter(
        (tag) =>
          typeof tag === "string" && tag.trim().length > 0
      )
      .map((tag) => tag.trim());

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
      .filter(
        ([key, value]) =>
          key && value !== undefined && value !== null
      )
      .map(
        ([key, value]) =>
          `${key}: ${
            typeof value === "object"
              ? JSON.stringify(value)
              : String(value)
          }`
      );

    if (specEntries.length > 0) {
      parts.push(
        `Specifications: ${specEntries.join("; ")}`
      );
    }
  }

  if (
    product.deliveryInfo &&
    typeof product.deliveryInfo === "string" &&
    product.deliveryInfo.trim()
  ) {
    parts.push(
      `Delivery Info: ${product.deliveryInfo.trim()}`
    );
  }

  if (
    product.returnPolicy &&
    typeof product.returnPolicy === "string" &&
    product.returnPolicy.trim()
  ) {
    parts.push(
      `Return Policy: ${product.returnPolicy.trim()}`
    );
  }

  return parts.join("\n");
}

/**
 * Gemini Embedding Provider
 *
 * Uses Google's gemini-embedding-001 model.
 * Output is configured to 1536 dimensions to match
 * the PostgreSQL pgvector column.
 */
export class GeminiEmbeddingProvider
  implements EmbeddingProvider
{
  readonly model: string;
  readonly dimensions: number;

  private readonly apiKey: string;
  private readonly client: GoogleGenAI;

  constructor(
    options: GeminiEmbeddingProviderOptions = {}
  ) {
    const apiKey =
      options.apiKey ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_API_KEY;

    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(
        "Gemini API key is missing. Set GEMINI_API_KEY in environment variables."
      );
    }

    this.apiKey = apiKey;
    this.model =
      options.model ??
      process.env.GEMINI_EMBEDDING_MODEL ??
      "gemini-embedding-001";

    this.dimensions = options.dimensions ?? 1536;

    this.client = new GoogleGenAI({
      apiKey: this.apiKey,
    });
  }

  async embedText(text: string): Promise<number[]> {
    const trimmed = text.trim();

    if (!trimmed) {
      throw new Error("Cannot embed empty text.");
    }

    try {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: trimmed,
        config: {
          outputDimensionality: this.dimensions,
        },
      });

      const embedding = response.embeddings?.[0]?.values;

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error(
          "Invalid embedding response received from Gemini."
        );
      }

      if (embedding.length !== this.dimensions) {
        throw new Error(
          `Unexpected embedding dimensions. Expected ${this.dimensions}, got ${embedding.length}.`
        );
      }

      return embedding;
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new Error(
          `Gemini embedding API failed: ${err.message}`
        );
      }

      throw err;
    }
  }

  async embedProduct(
    product: ProductSemanticInput
  ): Promise<number[]> {
    const text = buildProductEmbeddingText(product);
    return this.embedText(text);
  }
}