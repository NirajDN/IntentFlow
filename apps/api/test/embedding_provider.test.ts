import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OpenAIEmbeddingProvider,
  buildProductEmbeddingText,
  type ProductSemanticInput,
} from "@intentflow/ai";

describe("M4-B: Embedding Provider & Semantic Text Extractor", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Product Semantic Text Conversion", () => {
    const fullProduct: ProductSemanticInput = {
      id: "prod-12345",
      name: "Pro Noise-Cancelling Headphones",
      brand: "AudioCraft",
      category: { name: "Electronics & Audio" },
      description: "Over-ear wireless headphones with active noise cancellation and 40h battery.",
      tags: ["wireless", "anc", "bluetooth", "hifi"],
      specifications: {
        driver: "40mm dynamic",
        batteryLife: "40 hours",
        weight: "250g",
      },
      deliveryInfo: "Next day delivery available",
      returnPolicy: "14-day replacement policy",
      // Non-semantic / sensitive / inventory fields that must NOT be included:
      price: 14999.0,
      currency: "INR",
      stock: 45,
      availableQuantity: 45,
      reservedQuantity: 5,
      soldQuantity: 120,
      sku: "AC-ANC-001",
      merchantId: "merch-secret-999",
      ownerId: "user-secret-888",
    };

    it("includes all semantic fields in generated text", () => {
      const text = buildProductEmbeddingText(fullProduct);

      expect(text).toContain("Product: Pro Noise-Cancelling Headphones");
      expect(text).toContain("Brand: AudioCraft");
      expect(text).toContain("Category: Electronics & Audio");
      expect(text).toContain("Description: Over-ear wireless headphones with active noise cancellation and 40h battery.");
      expect(text).toContain("Tags: wireless, anc, bluetooth, hifi");
      expect(text).toContain("Specifications: driver: 40mm dynamic; batteryLife: 40 hours; weight: 250g");
      expect(text).toContain("Delivery Info: Next day delivery available");
      expect(text).toContain("Return Policy: 14-day replacement policy");
    });

    it("strictly excludes price and currency", () => {
      const text = buildProductEmbeddingText(fullProduct);
      expect(text).not.toContain("14999");
      expect(text).not.toContain("Price");
      expect(text).not.toContain("INR");
    });

    it("strictly excludes stock and inventory metrics", () => {
      const text = buildProductEmbeddingText(fullProduct);
      expect(text).not.toContain("Stock");
      expect(text).not.toContain("availableQuantity");
      expect(text).not.toContain("reservedQuantity");
      expect(text).not.toContain("soldQuantity");
      expect(text).not.toContain("45");
      expect(text).not.toContain("120");
    });

    it("strictly excludes SKU and merchant credentials", () => {
      const text = buildProductEmbeddingText(fullProduct);
      expect(text).not.toContain("AC-ANC-001");
      expect(text).not.toContain("SKU");
      expect(text).not.toContain("sku");
      expect(text).not.toContain("merch-secret-999");
      expect(text).not.toContain("user-secret-888");
      expect(text).not.toContain("prod-12345");
    });

    it("handles sparse product input cleanly", () => {
      const sparseProduct: ProductSemanticInput = {
        name: "Simple Wireless Mouse",
      };

      const text = buildProductEmbeddingText(sparseProduct);
      expect(text).toBe("Product: Simple Wireless Mouse");
    });
  });

  describe("OpenAIEmbeddingProvider Implementation", () => {
    it("initializes without throwing even when OPENAI_API_KEY is unset", () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => new OpenAIEmbeddingProvider()).not.toThrow();
    });

    it("throws a clear error when embedding is requested without API key", async () => {
      delete process.env.OPENAI_API_KEY;
      const provider = new OpenAIEmbeddingProvider({ apiKey: "" });

      await expect(provider.embedText("test query")).rejects.toThrow(
        "OpenAI API key is missing. Set OPENAI_API_KEY in environment variables."
      );
    });

    it("throws a clear error when attempting to embed empty text", async () => {
      const provider = new OpenAIEmbeddingProvider({ apiKey: "mock-key" });
      await expect(provider.embedText("   ")).rejects.toThrow("Cannot embed empty text.");
    });

    it("handles OpenAI API error responses cleanly", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { message: "Invalid authentication credentials" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIEmbeddingProvider({ apiKey: "invalid-key" });
      await expect(provider.embedText("search term")).rejects.toThrow(
        "OpenAI embedding API failed with status 401"
      );
    });

    it("successfully returns a 1536-dimensional embedding with mocked API", async () => {
      const mockVector = Array.from({ length: 1536 }, (_, i) => Math.sin(i));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          object: "list",
          data: [{ object: "embedding", index: 0, embedding: mockVector }],
          model: "text-embedding-3-small",
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIEmbeddingProvider({ apiKey: "valid-mock-key" });
      const embedding = await provider.embedText("premium mechanical keyboard");

      expect(embedding).toHaveLength(1536);
      expect(embedding[0]).toBeCloseTo(Math.sin(0));
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer valid-mock-key",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: "premium mechanical keyboard",
            dimensions: 1536,
          }),
        })
      );
    });

    it("embeds product using semantic representation", async () => {
      const mockVector = Array.from({ length: 1536 }, () => 0.05);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockVector }],
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIEmbeddingProvider({ apiKey: "valid-mock-key" });
      const embedding = await provider.embedProduct({
        name: "Ergonomic Office Chair",
        brand: "ComfortPlus",
        price: 9999, // Should be ignored in payload
      });

      expect(embedding).toHaveLength(1536);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.input).toContain("Product: Ergonomic Office Chair");
      expect(requestBody.input).toContain("Brand: ComfortPlus");
      expect(requestBody.input).not.toContain("9999");
    });

    it("handles request timeout cleanly", async () => {
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new OpenAIEmbeddingProvider({
        apiKey: "valid-mock-key",
        timeoutMs: 50,
      });

      await expect(provider.embedText("timeout test")).rejects.toThrow(
        "OpenAI embedding request timed out"
      );
    });
  });
});
