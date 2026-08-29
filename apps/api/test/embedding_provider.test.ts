import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GeminiEmbeddingProvider,
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
      description:
        "Over-ear wireless headphones with active noise cancellation and 40h battery.",
      tags: ["wireless", "anc", "bluetooth", "hifi"],
      specifications: {
        driver: "40mm dynamic",
        batteryLife: "40 hours",
        weight: "250g",
      },
      deliveryInfo: "Next day delivery available",
      returnPolicy: "14-day replacement policy",

      // Non-semantic / sensitive / inventory fields
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

      expect(text).toContain(
        "Product: Pro Noise-Cancelling Headphones"
      );
      expect(text).toContain("Brand: AudioCraft");
      expect(text).toContain("Category: Electronics & Audio");
      expect(text).toContain(
        "Description: Over-ear wireless headphones with active noise cancellation and 40h battery."
      );
      expect(text).toContain(
        "Tags: wireless, anc, bluetooth, hifi"
      );
      expect(text).toContain(
        "Specifications: driver: 40mm dynamic; batteryLife: 40 hours; weight: 250g"
      );
      expect(text).toContain(
        "Delivery Info: Next day delivery available"
      );
      expect(text).toContain(
        "Return Policy: 14-day replacement policy"
      );
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

  describe("GeminiEmbeddingProvider Implementation", () => {
    it("throws a clear error when Gemini API key is missing", () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      expect(
        () => new GeminiEmbeddingProvider({ apiKey: "" })
      ).toThrow(
        "Gemini API key is missing. Set GEMINI_API_KEY in environment variables."
      );
    });

    it("accepts an explicit Gemini API key", () => {
      expect(
        () =>
          new GeminiEmbeddingProvider({
            apiKey: "mock-gemini-key",
          })
      ).not.toThrow();
    });

    it("throws a clear error when attempting to embed empty text", async () => {
      const provider = new GeminiEmbeddingProvider({
        apiKey: "mock-key",
      });

      await expect(
        provider.embedText("   ")
      ).rejects.toThrow("Cannot embed empty text.");
    });

    it("handles Gemini API errors cleanly", async () => {
      const provider = new GeminiEmbeddingProvider({
        apiKey: "invalid-key",
      });

      const embedContentSpy = vi
        .spyOn(
          (provider as any).client.models,
          "embedContent"
        )
        .mockRejectedValue(
          new Error("Invalid authentication credentials")
        );

      await expect(
        provider.embedText("search term")
      ).rejects.toThrow(
        "Gemini embedding API failed: Invalid authentication credentials"
      );

      expect(embedContentSpy).toHaveBeenCalled();
    });

    it("successfully returns a 1536-dimensional embedding with mocked API", async () => {
      const mockVector = Array.from(
        { length: 1536 },
        (_, i) => Math.sin(i)
      );

      const provider = new GeminiEmbeddingProvider({
        apiKey: "valid-mock-key",
      });

      const embedContentSpy = vi
        .spyOn(
          (provider as any).client.models,
          "embedContent"
        )
        .mockResolvedValue({
          embeddings: [{ values: mockVector }],
        });

      const embedding = await provider.embedText(
        "premium mechanical keyboard"
      );

      expect(embedding).toHaveLength(1536);
      expect(embedding[0]).toBeCloseTo(Math.sin(0));

      expect(embedContentSpy).toHaveBeenCalledWith({
        model: "gemini-embedding-001",
        contents: "premium mechanical keyboard",
        config: {
          outputDimensionality: 1536,
        },
      });
    });

    it("embeds product using semantic representation", async () => {
      const mockVector = Array.from(
        { length: 1536 },
        () => 0.05
      );

      const provider = new GeminiEmbeddingProvider({
        apiKey: "valid-mock-key",
      });

      const embedContentSpy = vi
        .spyOn(
          (provider as any).client.models,
          "embedContent"
        )
        .mockResolvedValue({
          embeddings: [{ values: mockVector }],
        });

      const embedding = await provider.embedProduct({
        name: "Ergonomic Office Chair",
        brand: "ComfortPlus",
        price: 9999,
      });

      expect(embedding).toHaveLength(1536);

      expect(embedContentSpy).toHaveBeenCalledWith({
        model: "gemini-embedding-001",
        contents: expect.stringContaining(
          "Product: Ergonomic Office Chair"
        ),
        config: {
          outputDimensionality: 1536,
        },
      });

      const request = embedContentSpy.mock.calls[0][0];

      expect(request.contents).toContain(
        "Brand: ComfortPlus"
      );
      expect(request.contents).not.toContain("9999");
    });

    it("handles request timeout cleanly", async () => {
      const provider = new GeminiEmbeddingProvider({
        apiKey: "valid-mock-key",
        timeoutMs: 50,
      });

      const embedContentSpy = vi
        .spyOn(
          (provider as any).client.models,
          "embedContent"
        )
        .mockRejectedValue(
          Object.assign(
            new Error("This operation was aborted"),
            {
              name: "AbortError",
            }
          )
        );

      await expect(
        provider.embedText("timeout test")
      ).rejects.toThrow(
        "Gemini embedding API failed: This operation was aborted"
      );

      expect(embedContentSpy).toHaveBeenCalled();
    });
  });
});