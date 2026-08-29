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
  ram?: number;
  inStockOnly: boolean;
  source?: "gemini" | "fallback";
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
- Keyboards
- Gaming Mice
- Laptops
- Smartphones
- Monitors
- Accessories
- Storage
- Networking
- Speakers

Return ONLY valid JSON with exactly these fields:

{
  "query": "semantic product search query",
  "category": "one of the available catalog categories or null",
  "minPrice": number or null,
  "maxPrice": number or null,
  "ram": number or null,
  "inStockOnly": boolean
}

Rules:

1. QUERY
- query should contain the meaningful product requirements.
- Remove explicit price constraints from query when possible.
- Keep important attributes such as wireless, noise cancelling, gaming, microphone, bass, lightweight, etc.

2. CATEGORY
- Return exactly one category from the available catalog categories, or null if the category genuinely cannot be determined.
- "headphones", "earphones", "earbuds", "audio", "music" → "Audio".
- "gaming headset", "gaming headphones", "gaming", "PC gaming", "PlayStation gaming" → "Gaming".
- "keyboard", "mechanical keyboard", "RGB keyboard" → "Keyboards".
- "gaming mouse", "gaming mice", "mouse" → "Gaming Mice".
- "laptop", "notebook", "programming laptop", "college laptop", "gaming laptop", "gaming notebook" → "Laptops".
- "phone", "smartphone", "mobile" → "Smartphones".
- "monitor", "display", "screen" → "Monitors".
- "webcam", "power bank", "accessory", "accessories" → "Accessories".
- "SSD", "hard drive", "external drive", "storage" → "Storage".
- "router", "Wi-Fi", "wifi", "networking" → "Networking".
- "speaker", "Bluetooth speaker", "portable speaker" → "Speakers".
- Never return a product name as the category.
- Never invent a category.
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

4. RAM
- If the user explicitly specifies RAM, extract it as a number in GB.
- "32 GB RAM", "32GB RAM", "RAM should be 32 GB" means ram = 32.
- "16 GB RAM" means ram = 16.
- Never invent a RAM requirement.
- If RAM is not specified, use null.
- RAM is a hard requirement and must be treated as a mandatory product constraint.

5. STOCK
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

ram:
  typeof parsed.ram === "number" &&
  Number.isFinite(parsed.ram)
    ? parsed.ram
    : undefined,

inStockOnly:
  parsed.inStockOnly !== false,

        source: "gemini",
      };
    } catch (err: unknown) {
      console.warn(
        "Gemini intent parsing failed. Using local fallback parser.",
        err
      );

      return parseIntentFallback(trimmed);
    }
  }
}
function parseIntentFallback(
  message: string
): ShoppingIntent {
  const lower = message.toLowerCase();

  let category: string | undefined;

  // NOTE: Order matters — more-specific checks must appear before generic ones.
  // "gaming mouse" → Gaming Mice (before generic "gaming")
  // "gaming laptop" / "gaming notebook" → Laptops (before generic "gaming")
  // "gaming monitor" → Monitors (before generic "gaming")
  // "keyboard" → Keyboards (before generic "gaming")
  if (
    lower.includes("gaming mouse") ||
    lower.includes("gaming mice") ||
    lower.match(/\bmouse\b/) !== null
  ) {
    category = "Gaming Mice";
  } else if (
    lower.includes("gaming laptop") ||
    lower.includes("gaming notebook")
  ) {
    category = "Laptops";
  } else if (
    lower.includes("mechanical keyboard") ||
    lower.includes("keyboard") ||
    lower.includes("rgb keyboard")
  ) {
    category = "Keyboards";
  } else if (
    lower.includes("monitor") ||
    lower.includes("display") ||
    lower.includes("screen")
  ) {
    category = "Monitors";
  } else if (
  lower.includes("gaming headset") ||
  lower.includes("gaming headphones") ||
  lower.includes("gaming microphone") ||
  lower.includes("pc gaming") ||
  lower.includes("playstation") ||
  lower.includes("gaming")
) {
  category = "Gaming";
} else if (
  lower.includes("laptop") ||
  lower.includes("notebook") ||
  lower.includes("programming laptop") ||
  lower.includes("college laptop")
) {
  category = "Laptops";
} else if (
  lower.includes("smartphone") ||
  lower.includes("mobile phone") ||
  /\bphone\b/.test(lower)
) {
  category = "Smartphones";
} else if (
  lower.includes("ssd") ||
  lower.includes("hard drive") ||
  lower.includes("external drive") ||
  lower.includes("storage")
) {
  category = "Storage";
} else if (
  lower.includes("router") ||
  lower.includes("wi-fi") ||
  lower.includes("wifi") ||
  lower.includes("networking")
) {
  category = "Networking";
} else if (
  lower.includes("webcam") ||
  lower.includes("power bank") ||
  lower.includes("accessory") ||
  lower.includes("accessories")
) {
  category = "Accessories";
} else if (
  lower.includes("bluetooth speaker") ||
  lower.includes("portable speaker") ||
  lower.includes("speaker")
) {
  category = "Speakers";
} else if (
  lower.includes("headphone") ||
  lower.includes("earphone") ||
  lower.includes("earbud") ||
  lower.includes("audio") ||
  lower.includes("music")
) {
  category = "Audio";
}

  let maxPrice: number | undefined;
  let minPrice: number | undefined;
let ram: number | undefined;

const ramMatch = lower.match(
  /(?:ram|memory)\s*(?:should\s*be|is|of|:)?\s*(\d+)\s*gb/
) ?? lower.match(
  /(\d+)\s*gb\s*(?:ram|memory)/
);

if (ramMatch?.[1]) {
  ram = Number(ramMatch[1]);
}

  const maxMatch = lower.match(
    /(?:under|below|less than|upto|up to)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*)/
  );

  if (maxMatch?.[1]) {
    maxPrice = Number(maxMatch[1].replace(/,/g, ""));
  }

  const minMatch = lower.match(
    /(?:above|over|more than)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*)/
  );

  if (minMatch?.[1]) {
    minPrice = Number(minMatch[1].replace(/,/g, ""));
  }

  let query = message
    .replace(
      /(?:under|below|less than|upto|up to)\s*(?:₹|rs\.?|inr)?\s*\d+(?:,\d+)*/gi,
      ""
    )
    .replace(
      /(?:above|over|more than)\s*(?:₹|rs\.?|inr)?\s*\d+(?:,\d+)*/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!query) {
    query = message.trim();
  }

  return {
    query,
    category,
    minPrice,
    maxPrice,
    ram,
    inStockOnly: true,
    source: "fallback",

  };
}