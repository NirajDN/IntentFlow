import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import prisma from "@intentflow/database";
import {
  indexProduct,
  indexAllProducts,
  computeProductContentHash,
} from "../src/services/embeddingService.js";
import type { EmbeddingProvider } from "@intentflow/ai";

describe("M4-C: Product Embedding & Indexing Pipeline", () => {
  let mockProvider: EmbeddingProvider;
  let embedCalls: string[] = [];
  let testMerchantId: string;
  let testCategoryId: string;

  beforeEach(async () => {
    embedCalls = [];
    mockProvider = {
      model: "text-embedding-3-small",
      dimensions: 1536,
      embedText: vi.fn().mockImplementation(async (text: string) => {
        embedCalls.push(text);
        // Deterministic mock vector of 1536 dimensions
        return Array.from({ length: 1536 }, (_, i) => (i === 0 ? text.length * 0.001 : 0.01));
      }),
      embedProduct: vi.fn().mockImplementation(async (prod: any) => {
        return mockProvider.embedText(prod.name);
      }),
    };

    // Clean up test data
    await prisma.productEmbedding.deleteMany();
    await prisma.inventoryAdjustment.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.merchantPolicy.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();

    // Seed test merchant & category
    const user = await prisma.user.create({
      data: {
        email: `merchant_${Date.now()}@intentflow.dev`,
        name: "Test Indexing Merchant",
        passwordHash: "dummyhash",
        role: "MERCHANT",
      },
    });

    const merchant = await prisma.merchant.create({
      data: {
        name: "Indexing Corp",
        slug: `indexing-corp-${Date.now()}`,
        ownerId: user.id,
      },
    });
    testMerchantId = merchant.id;

    const category = await prisma.category.create({
      data: {
        name: "Smart Gadgets",
        slug: `smart-gadgets-${Date.now()}`,
      },
    });
    testCategoryId = category.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("1. new product creates embedding with 1536-dimensional vector", async () => {
    const product = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        categoryId: testCategoryId,
        name: "Ultra HD Action Cam",
        slug: "ultra-hd-action-cam",
        brand: "GoCapture",
        description: "Waterproof 4K action camera with optical stabilization.",
        price: 19999,
        currency: "INR",
        tags: ["camera", "action", "4k"],
      },
      include: { category: true },
    });

    const res = await indexProduct(product.id, { provider: mockProvider });

    expect(res.status).toBe("indexed");
    expect(res.productId).toBe(product.id);
    expect(embedCalls).toHaveLength(1);

    // Verify record in database
    const embedding = await prisma.productEmbedding.findUnique({
      where: { productId: product.id },
    });
    expect(embedding).not.toBeNull();
    expect(embedding?.contentHash).toBe(res.contentHash);
    expect(embedding?.model).toBe("text-embedding-3-small");
  });

  it("2. unchanged product skips embedding without calling provider", async () => {
    const product = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        categoryId: testCategoryId,
        name: "Wireless ANC Headphones",
        slug: "wireless-anc-headphones",
        brand: "SoundPeak",
        price: 7999,
      },
      include: { category: true },
    });

    // First indexing
    const firstRes = await indexProduct(product.id, { provider: mockProvider });
    expect(firstRes.status).toBe("indexed");
    expect(embedCalls).toHaveLength(1);

    // Second indexing without changes
    const secondRes = await indexProduct(product.id, { provider: mockProvider });
    expect(secondRes.status).toBe("skipped");
    expect(secondRes.reason).toBe("unchanged");
    expect(embedCalls).toHaveLength(1); // Provider not called again
  });

  it("3. semantic field change (description/tags) regenerates embedding", async () => {
    const product = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        name: "Mechanical Keyboard",
        slug: "mechanical-keyboard",
        description: "Blue switch clicky keyboard",
        price: 4999,
      },
    });

    await indexProduct(product.id, { provider: mockProvider });
    expect(embedCalls).toHaveLength(1);

    // Update semantic description
    await prisma.product.update({
      where: { id: product.id },
      data: { description: "Brown switch tactile silent keyboard with RGB" },
    });

    const updateRes = await indexProduct(product.id, { provider: mockProvider });
    expect(updateRes.status).toBe("indexed");
    expect(embedCalls).toHaveLength(2);
  });

  it("4. price-only change does NOT regenerate embedding", async () => {
    const product = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        name: "Studio Microphone",
        slug: "studio-microphone",
        price: 5000,
      },
    });

    await indexProduct(product.id, { provider: mockProvider });
    expect(embedCalls).toHaveLength(1);

    // Update only price
    await prisma.product.update({
      where: { id: product.id },
      data: { price: 3500 }, // Discounted
    });

    const secondRes = await indexProduct(product.id, { provider: mockProvider });
    expect(secondRes.status).toBe("skipped");
    expect(embedCalls).toHaveLength(1); // Not called
  });

  it("5. stock-only change does NOT regenerate embedding", async () => {
    const product = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        name: "Gaming Mouse Pad",
        slug: "gaming-mouse-pad",
        price: 999,
        inventory: {
          create: {
            availableQuantity: 50,
          },
        },
      },
      include: { inventory: true },
    });

    await indexProduct(product.id, { provider: mockProvider });
    expect(embedCalls).toHaveLength(1);

    // Update inventory availableQuantity
    await prisma.inventory.update({
      where: { productId: product.id },
      data: { availableQuantity: 15 },
    });

    const secondRes = await indexProduct(product.id, { provider: mockProvider });
    expect(secondRes.status).toBe("skipped");
    expect(embedCalls).toHaveLength(1);
  });

  it("6. SKU-only variant change does NOT regenerate embedding", async () => {
    const product = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        name: "USB-C Fast Cable",
        slug: "usb-c-fast-cable",
        price: 499,
        variants: {
          create: {
            name: "1 Meter",
            sku: "CABLE-1M",
            price: 499,
          },
        },
      },
      include: { variants: true },
    });

    await indexProduct(product.id, { provider: mockProvider });
    expect(embedCalls).toHaveLength(1);

    // Update SKU on variant
    await prisma.productVariant.update({
      where: { sku: "CABLE-1M" },
      data: { sku: "CABLE-1M-V2" },
    });

    const secondRes = await indexProduct(product.id, { provider: mockProvider });
    expect(secondRes.status).toBe("skipped");
    expect(embedCalls).toHaveLength(1);
  });

  it("7. repeated indexing creates no duplicate ProductEmbedding", async () => {
    const product = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        name: "Portable Power Bank 20000mAh",
        slug: "power-bank-20000mah",
        price: 1899,
      },
    });

    await indexProduct(product.id, { provider: mockProvider });
    await indexProduct(product.id, { provider: mockProvider, force: true });
    await indexProduct(product.id, { provider: mockProvider, force: true });

    const embeddings = await prisma.productEmbedding.findMany({
      where: { productId: product.id },
    });
    expect(embeddings).toHaveLength(1);
  });

  it("8. missing embedding is automatically created", async () => {
    const product = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        name: "Noise-Isolating Ear Tips",
        slug: "noise-isolating-ear-tips",
        price: 299,
      },
    });

    const existing = await prisma.productEmbedding.findUnique({
      where: { productId: product.id },
    });
    expect(existing).toBeNull();

    const res = await indexProduct(product.id, { provider: mockProvider });
    expect(res.status).toBe("indexed");

    const created = await prisma.productEmbedding.findUnique({
      where: { productId: product.id },
    });
    expect(created).not.toBeNull();
  });

  it("9. provider failure preserves existing embedding safely", async () => {
    const product = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        name: "Smart Fitness Band",
        slug: "smart-fitness-band",
        description: "Initial tracker features",
        price: 2499,
      },
    });

    // Create initial valid embedding
    const initialRes = await indexProduct(product.id, { provider: mockProvider });
    expect(initialRes.status).toBe("indexed");
    const initialEmbedding = await prisma.productEmbedding.findUnique({
      where: { productId: product.id },
    });

    // Update product semantic description
    await prisma.product.update({
      where: { id: product.id },
      data: { description: "Updated with ECG sensor and GPS" },
    });

    // Failing provider
    const failingProvider: EmbeddingProvider = {
      model: "text-embedding-3-small",
      dimensions: 1536,
      embedText: vi.fn().mockRejectedValue(new Error("Rate limit exceeded")),
      embedProduct: vi.fn().mockRejectedValue(new Error("Rate limit exceeded")),
    };

    const failRes = await indexProduct(product.id, { provider: failingProvider });
    expect(failRes.status).toBe("failed");
    expect(failRes.error).toContain("Rate limit exceeded");

    // Verify previous embedding is preserved, not deleted or corrupted
    const preservedEmbedding = await prisma.productEmbedding.findUnique({
      where: { productId: product.id },
    });
    expect(preservedEmbedding).not.toBeNull();
    expect(preservedEmbedding?.id).toBe(initialEmbedding?.id);
    expect(preservedEmbedding?.contentHash).toBe(initialEmbedding?.contentHash);
  });

  it("10. bulk indexAllProducts processes, skips, and reports correct counts", async () => {
    // Create 3 products
    const p1 = await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Product Alpha", slug: "prod-alpha", price: 100 },
    });
    const p2 = await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Product Beta", slug: "prod-beta", price: 200 },
    });
    const p3 = await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Product Gamma", slug: "prod-gamma", price: 300 },
    });

    // Pre-index p1
    await indexProduct(p1.id, { provider: mockProvider });

    // Run batch index
    const result = await indexAllProducts({ provider: mockProvider });

    expect(result.total).toBe(3);
    expect(result.indexed).toBe(2); // p2 and p3 newly indexed
    expect(result.skipped).toBe(1); // p1 skipped as unchanged
    expect(result.failed).toBe(0);
  });
});
