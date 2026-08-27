/**
 * @intentflow/ai
 * AI & Embedding Provider Infrastructure
 */

import { GoogleGenAI } from "@google/genai";

// ============================================================
// Product Embeddings
// ============================================================

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
          `${key}: ${typeof value === "object"
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
  implements EmbeddingProvider {
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

// ============================================================
// Shopping Intent Parser
// ============================================================

export interface ShoppingIntent {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly: boolean;
}

export interface IntentParserOptions {
  apiKey?: string;
  model?: string;
}

/**
 * Parses a natural-language shopping request into
 * structured search parameters.
 */
export class GeminiIntentParser {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: IntentParserOptions = {}) {
    const apiKey =
      options.apiKey ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_API_KEY;

    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(
        "Gemini API key is missing. Set GEMINI_API_KEY in environment variables."
      );
    }

    this.client = new GoogleGenAI({
      apiKey,
    });

    this.model =
      options.model ??
      process.env.GEMINI_INTENT_MODEL ??
      "gemini-2.5-flash";
  }

  async parseIntent(
    message: string
  ): Promise<ShoppingIntent> {
    const trimmed = message.trim();

    if (!trimmed) {
      throw new Error(
        "Shopping request cannot be empty."
      );
    }

    const prompt = `
You are the intent parser for an e-commerce search system.

Convert the user's shopping request into structured JSON.

User request:
"${trimmed}"

Available product categories in the catalog:
- Audio
- Gaming

Return ONLY valid JSON with exactly these fields:

{
  "query": "semantic product search query",
  "category": "category name or null",
  "minPrice": number or null,
  "maxPrice": number or null,
  "inStockOnly": boolean
}

Rules:

1. QUERY
- query should contain the meaningful product requirements.
- Remove explicit price constraints from query when possible.
- Keep important attributes such as wireless, noise cancelling, gaming, microphone, bass, lightweight, etc.

2. CATEGORY
- category MUST be either "Audio", "Gaming", or null.
- "headphones", "earphones", "earbuds", "speakers", "music", "audio" should map to "Audio".
- "gaming headset", "gaming headphones", "gaming microphone", "gaming", "PC gaming", "PlayStation gaming" should map to "Gaming".
- Do NOT return product types such as "headphones" as a category.
- Never invent a category.
- If the category is unclear, use null.

3. PRICE
- Prices must be numbers in INR.
- "under 5000" means maxPrice = 5000.
- "below 5000" means maxPrice = 5000.
- "less than 5000" means maxPrice = 5000.
- "above 2000" means minPrice = 2000.
- "over 2000" means minPrice = 2000.
- If no minimum price is specified, use null.
- If no maximum price is specified, use null.
- Never invent a price.

4. STOCK
- Set inStockOnly to true by default.
- Only set it to false when the user explicitly asks for unavailable or out-of-stock products.

Return ONLY JSON.
`;

    try {
      const response =
        await this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

      const text = response.text?.trim();

      if (!text) {
        throw new Error(
          "Gemini returned an empty intent response."
        );
      }

      const parsed = JSON.parse(
        text
      ) as Partial<ShoppingIntent>;

      if (typeof parsed.query !== "string") {
        throw new Error(
          "Gemini intent response is missing query."
        );
      }

      return {
        query: parsed.query.trim(),

        category:
          typeof parsed.category === "string" &&
            parsed.category.trim().length > 0
            ? parsed.category.trim()
            : undefined,

        minPrice:
          typeof parsed.minPrice === "number" &&
            Number.isFinite(parsed.minPrice)
            ? parsed.minPrice
            : undefined,

        maxPrice:
          typeof parsed.maxPrice === "number" &&
            Number.isFinite(parsed.maxPrice)
            ? parsed.maxPrice
            : undefined,

        inStockOnly:
          parsed.inStockOnly !== false,
      };
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new Error(
          `Gemini intent parsing failed: ${err.message}`
        );
      }

      throw err;
    }
  }
}