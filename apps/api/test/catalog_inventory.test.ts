import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import prisma from "@intentflow/database";

describe("M3 Merchant Catalog & Inventory Tests", () => {
  const merchantUserA = {
    email: `merchant_a_${Date.now()}@intentflow.test`,
    password: "Password123!",
    name: "Merchant A Owner",
    role: "MERCHANT" as const,
  };

  const merchantUserB = {
    email: `merchant_b_${Date.now()}@intentflow.test`,
    password: "Password123!",
    name: "Merchant B Owner",
    role: "MERCHANT" as const,
  };

  let tokenA = "";
  let tokenB = "";
  let merchantAId = "";
  let merchantBId = "";

  let categoryId = "";
  let categorySlug = `electronics-${Date.now()}`;

  let createdProductId = "";
  let variantSku = `SKU-PROD-${Date.now()}`;

  beforeAll(async () => {
    // 1. Register Merchant A
    const resA = await request(app).post("/api/auth/register").send(merchantUserA);
    tokenA = resA.body.data.token;

    const mResA = await request(app)
      .post("/api/merchants")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Merchant A Store",
        slug: `store-a-${Date.now()}`,
      });
    merchantAId = mResA.body.data.id;

    // 2. Register Merchant B
    const resB = await request(app).post("/api/auth/register").send(merchantUserB);
    tokenB = resB.body.data.token;

    const mResB = await request(app)
      .post("/api/merchants")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        name: "Merchant B Store",
        slug: `store-b-${Date.now()}`,
      });
    merchantBId = mResB.body.data.id;

    // 3. Create Category
    const catRes = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Electronics",
        slug: categorySlug,
      });
    categoryId = catRes.body.data.id;
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: { in: [merchantUserA.email, merchantUserB.email] },
        },
      });
    } catch {
      // ignore
    }
  });

  // 1. create product
  it("1. create product with valid data and initial stock", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Wireless Noise-Cancelling Headphones",
        slug: `headphones-${Date.now()}`,
        categoryId,
        description: "High fidelity wireless audio",
        brand: "SonicMax",
        price: 14999.0,
        currency: "INR",
        initialStock: 50,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Wireless Noise-Cancelling Headphones");
    expect(res.body.data.price).toBe(14999.0);
    expect(res.body.data.inventory).toBeDefined();
    expect(res.body.data.inventory.availableQuantity).toBe(50);

    createdProductId = res.body.data.id;
  });

  // 2. invalid product
  it("2. invalid product (negative price or missing name) is rejected with 400", async () => {
    // Missing name
    const res1 = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ price: 100 });
    expect(res1.status).toBe(400);

    // Negative price
    const res2 = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Invalid Item", price: -50 });
    expect(res2.status).toBe(400);
  });

  // 3. merchant cannot modify another merchant's product
  it("3. merchant cannot modify another merchant's product (rejected with 403)", async () => {
    const res = await request(app)
      .patch(`/api/products/${createdProductId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "Hacked by Merchant B" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 4. update product
  it("4. update product by authorized merchant", async () => {
    const res = await request(app)
      .patch(`/api/products/${createdProductId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        price: 13999.0,
        description: "Updated description with extended warranty",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.price).toBe(13999.0);
    expect(res.body.data.description).toBe("Updated description with extended warranty");
  });

  // 5. deactivate product
  it("5. deactivate product", async () => {
    const res = await request(app)
      .delete(`/api/products/${createdProductId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isActive).toBe(false);

    // Verify it reflects in DB
    const p = await prisma.product.findUnique({ where: { id: createdProductId } });
    expect(p?.isActive).toBe(false);

    // Reactivate for later inventory tests
    await prisma.product.update({ where: { id: createdProductId }, data: { isActive: true } });
  });

  // 6. product pagination
  it("6. product pagination returns correct page and limit structure", async () => {
    const res = await request(app).get("/api/products?page=1&limit=2");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(2);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totalPages).toBeGreaterThanOrEqual(1);
  });

  // 7. product filtering (by active status and search)
  it("7. product filtering by search query and active status", async () => {
    const res = await request(app).get("/api/products?search=SonicMax&isActive=true");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items[0].brand).toBe("SonicMax");
  });

  // 8. create inventory
  it("8. create inventory associated with product", async () => {
    const invRes = await request(app)
      .get(`/api/inventory/${createdProductId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(invRes.status).toBe(200);
    expect(invRes.body.success).toBe(true);
    expect(invRes.body.data.productId).toBe(createdProductId);
    expect(invRes.body.data.availableQuantity).toBe(50);
  });

  // 9. stock increase
  it("9. stock increase via adjustment", async () => {
    const res = await request(app)
      .post(`/api/inventory/${createdProductId}/adjust`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        quantityChange: 25,
        reason: "Supplier Restock Batch #101",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.availableQuantity).toBe(75);
    expect(res.body.data.adjustments[0].reason).toBe("Supplier Restock Batch #101");
  });

  // 10. stock decrease
  it("10. stock decrease via adjustment", async () => {
    const res = await request(app)
      .post(`/api/inventory/${createdProductId}/adjust`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        quantityChange: -15,
        reason: "Offline Retail Allocation",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.availableQuantity).toBe(60);
  });

  // 11. stock cannot become negative
  it("11. stock cannot become negative (rejected with 400)", async () => {
    const res = await request(app)
      .post(`/api/inventory/${createdProductId}/adjust`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        quantityChange: -500, // available is 60
        reason: "Massive Oversell Attempt",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/insufficient stock/i);
  });

  // 12. unauthorized inventory modification
  it("12. unauthorized inventory modification rejected (by another merchant)", async () => {
    const res = await request(app)
      .post(`/api/inventory/${createdProductId}/adjust`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        quantityChange: 10,
        reason: "Unauthorized attempt",
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // 13. variant creation
  it("13. variant creation with SKU and pricing", async () => {
    const pRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Pro Mechanical Keyboard",
        price: 4999.0,
        variants: [
          {
            name: "Blue Switches",
            sku: variantSku,
            price: 4999.0,
            specifications: { switchType: "Clicky Blue" },
          },
          {
            name: "Red Switches",
            sku: `${variantSku}-RED`,
            price: 5299.0,
            specifications: { switchType: "Linear Red" },
          },
        ],
      });

    expect(pRes.status).toBe(201);
    expect(pRes.body.success).toBe(true);
    expect(pRes.body.data.variants).toHaveLength(2);
    expect(pRes.body.data.variants[0].sku).toBe(variantSku);
  });

  // 14. duplicate SKU rejected
  it("14. duplicate SKU rejected with 409", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Another Keyboard",
        price: 3999.0,
        sku: variantSku, // duplicate
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already exists/i);
  });

  // 15. CSV valid rows
  it("15. CSV import with valid rows", async () => {
    const csvContent = `name,description,brand,category,price,currency,sku,stock
"Ergonomic Mouse","Wireless USB mouse","LogiTech","Computer Accessories",1999,INR,"ERGO-M-${Date.now()}",100
"4K Monitor 27inch","IPS UHD 144Hz","Dell","Monitors",24999,INR,"DELL-4K-${Date.now()}",20`;

    const res = await request(app)
      .post("/api/products/import")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ csvContent });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.imported).toBe(2);
    expect(res.body.data.failed).toBe(0);
    expect(res.body.data.errors).toHaveLength(0);
  });

  // 16. CSV invalid rows handled
  it("16. CSV invalid rows (negative price / invalid stock) handled", async () => {
    const csvContent = `name,description,brand,category,price,currency,sku,stock
"Valid Item","Valid desc","BrandX","CatX",500,INR,"SKU-V-${Date.now()}",10
"Invalid Price","Bad price","BrandY","CatY",-200,INR,"SKU-INV1-${Date.now()}",5
"","Missing Name","BrandZ","CatZ",300,INR,"SKU-INV2-${Date.now()}",5`;

    const res = await request(app)
      .post("/api/products/import")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ csvContent });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(3);
    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.failed).toBe(2);
  });

  // 17. CSV row-level errors returned
  it("17. CSV returns structured row-level errors for broken rows", async () => {
    const csvContent = `name,price,stock
"",-100,-50`;

    const res = await request(app)
      .post("/api/products/import")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ csvContent });

    expect(res.status).toBe(400);
    expect(res.body.data.errors).toBeInstanceOf(Array);
    expect(res.body.data.errors.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.errors[0].row).toBe(1);
    expect(res.body.data.errors[0].error).toBeDefined();
  });

  // 18. category filtering
  it("18. category filtering returns only products in specified category", async () => {
    const res = await request(app).get(`/api/products?categoryId=${categoryId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toBeInstanceOf(Array);
    for (const item of res.body.data.items) {
      expect(item.categoryId).toBe(categoryId);
    }
  });
});
