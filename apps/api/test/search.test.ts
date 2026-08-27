import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import prisma from "@intentflow/database";
import { searchProducts, validateSearchParams } from "../src/services/searchService.js";
import { setDefaultEmbeddingProvider } from "../src/services/embeddingService.js";
import type { EmbeddingProvider } from "@intentflow/ai";

// ── Shared mock vector factory ────────────────────────────────────────────────
function mockVector(seed: number = 0): number[] {
  return Array.from({ length: 1536 }, (_, i) => (i === 0 ? seed * 0.01 : 0.001));
}

// ── Mock provider with configurable embedText ─────────────────────────────────
function makeMockProvider(
  embedImpl: (text: string) => Promise<number[]> = async () => mockVector(1)
): EmbeddingProvider {
  return {
    model: "text-embedding-3-small",
    dimensions: 1536,
    embedText: vi.fn().mockImplementation(embedImpl),
    embedProduct: vi.fn().mockResolvedValue(mockVector(1)),
  };
}

describe("M4-D: Hybrid Semantic Product Search", () => {
  let testMerchantId: string;
  let testMerchantId2: string;
  let testCategoryId: string;
  let testCategoryId2: string;

  beforeEach(async () => {
    // Clean slate
    await prisma.productEmbedding.deleteMany();
    await prisma.inventoryAdjustment.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.merchantPolicy.deleteMany();
    await prisma.merchant.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();

    // Merchant 1
    const u1 = await prisma.user.create({
      data: {
        email: `m1_${Date.now()}@search.dev`,
        name: "Merchant One",
        passwordHash: "hash",
        role: "MERCHANT",
      },
    });
    const m1 = await prisma.merchant.create({
      data: { name: "Shop One", slug: `shop-one-${Date.now()}`, ownerId: u1.id },
    });
    testMerchantId = m1.id;

    // Merchant 2
    const u2 = await prisma.user.create({
      data: {
        email: `m2_${Date.now()}@search.dev`,
        name: "Merchant Two",
        passwordHash: "hash",
        role: "MERCHANT",
      },
    });
    const m2 = await prisma.merchant.create({
      data: { name: "Shop Two", slug: `shop-two-${Date.now()}`, ownerId: u2.id },
    });
    testMerchantId2 = m2.id;

    // Categories
    const c1 = await prisma.category.create({
      data: { name: "Audio", slug: `audio-${Date.now()}` },
    });
    testCategoryId = c1.id;

    const c2 = await prisma.category.create({
      data: { name: "Gaming", slug: `gaming-${Date.now()}` },
    });
    testCategoryId2 = c2.id;

    // Reset default provider
    setDefaultEmbeddingProvider(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setDefaultEmbeddingProvider(null);
  });

  // ─── Helper to insert a product embedding ───────────────────────────────────
  async function insertEmbedding(productId: string, similarity: number) {
    const vec = mockVector(similarity);
    const vectorString = `[${vec.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO product_embeddings ("id","productId","embedding","model","contentHash","createdAt","updatedAt")
       VALUES ($1,$2,$3::vector,$4,$5,NOW(),NOW())
       ON CONFLICT ("productId") DO UPDATE SET embedding=EXCLUDED.embedding, "contentHash"=EXCLUDED."contentHash", "updatedAt"=NOW()`,
      `emb_${Math.random().toString(36).slice(2)}`,
      productId,
      vectorString,
      "text-embedding-3-small",
      `hash_${productId}`
    );
  }

  // 1. Semantic search returns relevant products ─────────────────────────────
  it("1. semantic search returns products scored by vector similarity", async () => {
    const p1 = await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Wireless ANC Headphones", slug: "anc-hp", price: 8999 },
    });
    const p2 = await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Gaming Chair", slug: "gc-chair", price: 12000 },
    });

    await insertEmbedding(p1.id, 0.9); // High similarity
    await insertEmbedding(p2.id, 0.2); // Low similarity

    // Mock pgvector returning p1 closer
    const mockProvider = makeMockProvider(async () => mockVector(0.9));
    vi.spyOn(prisma, "$queryRawUnsafe").mockResolvedValue([
      { product_id: p1.id, distance: 0.1 },  // similarity = 0.9
      { product_id: p2.id, distance: 0.8 },  // similarity = 0.2
    ] as any);

    const result = await searchProducts({ query: "noise cancelling headphones", provider: mockProvider });

    expect(result.semanticEnabled).toBe(true);
    expect(result.items.length).toBeGreaterThanOrEqual(2);
    // p1 should rank higher due to semantic score
    const firstId = result.items[0].product.id;
    expect(firstId).toBe(p1.id);
  });

  // 2. Category filter ─────────────────────────────────────────────────────────
  it("2. category filter returns only products in the specified category", async () => {
    await prisma.product.create({
      data: { merchantId: testMerchantId, categoryId: testCategoryId, name: "Studio Mic", slug: "studio-mic", price: 3000 },
    });
    await prisma.product.create({
      data: { merchantId: testMerchantId, categoryId: testCategoryId2, name: "Gaming Mouse", slug: "gaming-mouse", price: 1500 },
    });

    const result = await searchProducts({ categoryId: testCategoryId });

    expect(result.items.every(i => i.product.categoryId === testCategoryId)).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].product.name).toBe("Studio Mic");
  });

  // 3. Price filter ─────────────────────────────────────────────────────────────
  it("3. price filter excludes products outside the range", async () => {
    await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Cheap Earphone", slug: "cheap-ep", price: 299 },
    });
    await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Premium Speaker", slug: "prem-sp", price: 15000 },
    });
    await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Mid-range Mic", slug: "mid-mic", price: 3500 },
    });

    const result = await searchProducts({ minPrice: 500, maxPrice: 5000 });

    expect(result.items.every(i => i.product.price >= 500 && i.product.price <= 5000)).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].product.name).toBe("Mid-range Mic");
  });

  // 4. Active-only filter ───────────────────────────────────────────────────────
  it("4. activeOnly=true excludes inactive products", async () => {
    await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Active Product", slug: "active-prod", price: 999, isActive: true },
    });
    await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Inactive Product", slug: "inactive-prod", price: 999, isActive: false },
    });

    const result = await searchProducts({ activeOnly: true });

    expect(result.items.every(i => i.product.isActive)).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].product.name).toBe("Active Product");
  });

  // 5. Merchant isolation ───────────────────────────────────────────────────────
  it("5. merchantId filter returns only products from the specified merchant", async () => {
    await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Merchant One Product", slug: "m1-prod", price: 1000 },
    });
    await prisma.product.create({
      data: { merchantId: testMerchantId2, name: "Merchant Two Product", slug: "m2-prod", price: 2000 },
    });

    const result = await searchProducts({ merchantId: testMerchantId });

    expect(result.items.every(i => i.product.merchantId === testMerchantId)).toBe(true);
    expect(result.items.length).toBe(1);
  });

  // 6. Pagination ───────────────────────────────────────────────────────────────
  it("6. pagination returns correct slices and metadata", async () => {
    // Create 5 products
    for (let i = 1; i <= 5; i++) {
      await prisma.product.create({
        data: { merchantId: testMerchantId, name: `Product ${i}`, slug: `product-${i}-${Date.now()}-${i}`, price: 100 * i },
      });
    }

    const page1 = await searchProducts({ page: 1, limit: 2 });
    const page2 = await searchProducts({ page: 2, limit: 2 });
    const page3 = await searchProducts({ page: 3, limit: 2 });

    expect(page1.total).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.items.length).toBe(2);
    expect(page2.items.length).toBe(2);
    expect(page3.items.length).toBe(1);

    // No overlap
    const ids1 = new Set(page1.items.map(i => i.product.id));
    const ids2 = new Set(page2.items.map(i => i.product.id));
    expect([...ids1].filter(id => ids2.has(id))).toHaveLength(0);
  });

  // 7. Product with no embedding gets score 0 but still appears ─────────────
  it("7. product without embedding still appears with semanticScore=0", async () => {
    await prisma.product.create({
      data: { merchantId: testMerchantId, name: "No Embedding Product", slug: "no-emb", price: 500 },
    });

    const mockProvider = makeMockProvider(async () => mockVector(1));
    vi.spyOn(prisma, "$queryRawUnsafe").mockResolvedValue([] as any); // No vector matches

    const result = await searchProducts({ query: "headphones", provider: mockProvider });

    expect(result.semanticEnabled).toBe(true);
    expect(result.items.length).toBe(1);
    expect(result.items[0].semanticScore).toBe(0);
  });

  // 8. inStockOnly excludes out-of-stock products ───────────────────────────────
  it("8. inStockOnly=true excludes out-of-stock products", async () => {
    const inStock = await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        name: "In Stock Speaker",
        slug: "in-stock-sp",
        price: 4000,
        inventory: { create: { availableQuantity: 10 } },
      },
    });
    await prisma.product.create({
      data: {
        merchantId: testMerchantId,
        name: "Out of Stock Mic",
        slug: "oos-mic",
        price: 3500,
        inventory: { create: { availableQuantity: 0 } },
      },
    });

    const result = await searchProducts({ inStockOnly: true });

    expect(result.items.length).toBe(1);
    expect(result.items[0].product.id).toBe(inStock.id);
  });

  // 9. Semantic score cannot bypass hard filters ───────────────────────────────
  it("9. semantic relevance cannot bypass hard price filter", async () => {
    // Very expensive product - high semantic match but outside price range
    const expensive = await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Premium Audiophile DAC", slug: "prem-dac", price: 50000 },
    });
    const affordable = await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Entry DAC", slug: "entry-dac", price: 2000 },
    });

    await insertEmbedding(expensive.id, 0.99);
    await insertEmbedding(affordable.id, 0.3);

    const mockProvider = makeMockProvider(async () => mockVector(1));
    vi.spyOn(prisma, "$queryRawUnsafe").mockResolvedValue([
      { product_id: expensive.id, distance: 0.01 }, // near-perfect match
      { product_id: affordable.id, distance: 0.7 },
    ] as any);

    const result = await searchProducts({
      query: "audiophile DAC",
      maxPrice: 5000, // ← hard filter: expensive product must be excluded
      provider: mockProvider,
    });

    const ids = result.items.map(i => i.product.id);
    expect(ids).not.toContain(expensive.id); // MUST be excluded despite high semantic score
    expect(ids).toContain(affordable.id);
  });

  // 10. Invalid parameters rejected ────────────────────────────────────────────
  it("10. invalid search parameters throw a descriptive error", async () => {
    await expect(
      searchProducts({ minPrice: 5000, maxPrice: 1000 })
    ).rejects.toThrow("minPrice cannot be greater than maxPrice");

    await expect(
      searchProducts({ minPrice: -50 })
    ).rejects.toThrow("minPrice must be a non-negative number");
  });

  // 11. Embedding provider failure falls back gracefully ────────────────────────
  it("11. embedding provider failure causes graceful fallback to catalog search", async () => {
    await prisma.product.create({
      data: { merchantId: testMerchantId, name: "Bluetooth Speaker", slug: "bt-speaker", price: 1999 },
    });

    const failingProvider: EmbeddingProvider = {
      model: "text-embedding-3-small",
      dimensions: 1536,
      embedText: vi.fn().mockRejectedValue(new Error("Rate limit exceeded")),
      embedProduct: vi.fn().mockRejectedValue(new Error("Rate limit exceeded")),
    };

    // Should NOT throw — should fall back and return catalog results
    const result = await searchProducts({ query: "bluetooth speaker", provider: failingProvider });

    expect(result.semanticEnabled).toBe(false);   // fallback mode
    expect(result.items.length).toBeGreaterThan(0); // catalog results still returned
    expect(result.items[0].semanticScore).toBe(0);
  });

  // validateSearchParams tests ──────────────────────────────────────────────────
  it("validateSearchParams normalizes page/limit within bounds", () => {
    const { normalized } = validateSearchParams({ page: 0, limit: 9999 });
    expect(normalized.page).toBe(1);
    expect(normalized.limit).toBe(100);

    const { normalized: n2 } = validateSearchParams({ page: -5, limit: 0 });
    expect(n2.page).toBe(1);
    expect(n2.limit).toBe(1);
  });
});
