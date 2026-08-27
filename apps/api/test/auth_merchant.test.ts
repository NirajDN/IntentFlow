import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/index.js";
import prisma from "@intentflow/database";
import bcrypt from "bcryptjs";

describe("M2 Auth & Merchant Foundation Tests", () => {
  const testUserBuyer = {
    email: `buyer_${Date.now()}@intentflow.test`,
    password: "Password123!",
    name: "Test Buyer",
    role: "BUYER" as const,
  };

  const testUserMerchant = {
    email: `merchant_${Date.now()}@intentflow.test`,
    password: "MerchantPassword123!",
    name: "Test Merchant Owner",
    role: "MERCHANT" as const,
  };

  let buyerToken = "";
  let merchantToken = "";
  let merchantSlug = `acme-store-${Date.now()}`;

  afterAll(async () => {
    // Clean up test data
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [testUserBuyer.email, testUserMerchant.email, `dup_${testUserBuyer.email}`],
          },
        },
      });
    } catch {
      // ignore
    }
  });

  // 1. successful registration
  it("1. successful registration", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(testUserBuyer);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(testUserBuyer.email.toLowerCase());
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.role).toBe("BUYER");

    buyerToken = res.body.data.token;
  });

  // 2. duplicate email
  it("2. duplicate email rejected with 409", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(testUserBuyer);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already exists/i);
  });

  // 3. password hashing
  it("3. password hashing (never stored as plaintext)", async () => {
    const userInDb = await prisma.user.findUnique({
      where: { email: testUserBuyer.email.toLowerCase() },
    });

    expect(userInDb).toBeDefined();
    expect(userInDb!.passwordHash).not.toBe(testUserBuyer.password);
    const isMatch = await bcrypt.compare(testUserBuyer.password, userInDb!.passwordHash);
    expect(isMatch).toBe(true);
  });

  // 4. successful login
  it("4. successful login returns JWT and user payload", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: testUserBuyer.email,
        password: testUserBuyer.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(testUserBuyer.email.toLowerCase());
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  // 5. invalid password
  it("5. invalid password rejected with 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: testUserBuyer.email,
        password: "WrongPassword!",
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  // 6. protected route without token
  it("6. protected route without token rejected with 401", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/authentication required/i);
  });

  // 7. valid authenticated request
  it("7. valid authenticated request succeeds on GET /api/auth/me", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${buyerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(testUserBuyer.email.toLowerCase());
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  // 8. wrong role rejected
  it("8. wrong role rejected with 403 on merchant endpoints", async () => {
    // BUYER trying to create a merchant
    const res = await request(app)
      .post("/api/merchants")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({
        name: "Buyer Store",
        slug: `buyer-store-${Date.now()}`,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/access denied/i);
  });

  // 9. merchant creation
  it("9. merchant creation succeeds for MERCHANT role", async () => {
    // First register a MERCHANT user
    const regRes = await request(app)
      .post("/api/auth/register")
      .send(testUserMerchant);

    expect(regRes.status).toBe(201);
    merchantToken = regRes.body.data.token;
    expect(regRes.body.data.user.role).toBe("MERCHANT");

    // Now create a merchant
    const res = await request(app)
      .post("/api/merchants")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({
        name: "Acme Super Store",
        slug: merchantSlug,
        description: "Leading AI-native merchant store",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe("Acme Super Store");
    expect(res.body.data.slug).toBe(merchantSlug);
    expect(res.body.data.ownerId).toBe(regRes.body.data.user.id);
  });

  // 10. duplicate merchant slug
  it("10. duplicate merchant slug rejected with 409", async () => {
    const res = await request(app)
      .post("/api/merchants")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({
        name: "Duplicate Slug Store",
        slug: merchantSlug,
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already exists/i);
  });

  // 11. unauthorized merchant update
  it("11. unauthorized merchant update rejected with 401 or 403", async () => {
    // Request without token
    const resNoToken = await request(app)
      .patch("/api/merchants/me")
      .send({ name: "Hacked Store" });
    expect(resNoToken.status).toBe(401);

    // Request with BUYER token
    const resBuyer = await request(app)
      .patch("/api/merchants/me")
      .set("Authorization", `Bearer ${buyerToken}`)
      .send({ name: "Hacked Store" });
    expect(resBuyer.status).toBe(403);
  });

  // 12. merchant policy automatically created
  it("12. merchant policy is automatically created with default limit and currency", async () => {
    const res = await request(app)
      .get("/api/merchants/me")
      .set("Authorization", `Bearer ${merchantToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.policy).toBeDefined();
    expect(res.body.data.policy.currency).toBe("INR");
    expect(res.body.data.policy.defaultAutonomousSpendLimit).toBe(5000);
  });
});
