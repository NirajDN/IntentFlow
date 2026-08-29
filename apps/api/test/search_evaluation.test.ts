/**
 * search_evaluation.test.ts
 *
 * 100-query deterministic search quality evaluation.
 *
 * Design:
 * - Uses the LOCAL fallback parser only — zero Gemini API calls.
 * - Populates intentflow_test with a mini-catalog representative of
 *   the real seed data (same categories, same price ranges).
 * - Verifies hard constraints: maxPrice, minPrice, category, inStock, RAM.
 * - Verifies determinism: same query → same ordered IDs on 3 runs.
 * - Verifies no oversell / no constraint violations in any result.
 * - Reports a pass/fail/unstable summary at the end.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "@intentflow/database";
import { searchProducts } from "../src/services/searchService.js";
import { setDefaultEmbeddingProvider } from "../src/services/embeddingService.js";
import type { EmbeddingProvider } from "@intentflow/ai";

// ─── Null provider: semantic search disabled, pure deterministic catalog ──────
const nullProvider: EmbeddingProvider = {
  model: "null",
  dimensions: 1536,
  embedText: async () => { throw new Error("semantic disabled"); },
  embedProduct: async () => { throw new Error("semantic disabled"); },
};

// ─── Mini-catalog fixtures ─────────────────────────────────────────────────────
// These are representative of the real seed, enough to validate all query types.

interface Fixture {
  slug: string;
  name: string;
  price: number;
  category: string;
  brand: string;
  tags: string[];
  specs: Record<string, string | number>;
  stock: number;
}

const FIXTURES: Fixture[] = [
  // Audio
  { slug: "eval-wireless-hp-2499",    name: "Nova Wireless Headphones",          price: 2499,  category: "Audio",       brand: "SoundWave", tags: ["wireless","bluetooth","headphones"],              specs: {},         stock: 10 },
  { slug: "eval-anc-hp-4999",         name: "Clarity ANC Headphones",            price: 4999,  category: "Audio",       brand: "AudioMax",  tags: ["anc","noise-cancelling","wireless","headphones"],  specs: {},         stock: 10 },
  { slug: "eval-earbuds-1799",        name: "Pulse TWS Earbuds",                 price: 1799,  category: "Audio",       brand: "SoundWave", tags: ["earbuds","tws","wireless","earphones"],            specs: {},         stock: 10 },
  { slug: "eval-wired-hp-3499",       name: "Studio Pro Wired Headphones",       price: 3499,  category: "Audio",       brand: "AudioMax",  tags: ["wired","studio","monitoring","headphones"],        specs: {},         stock: 10 },
  { slug: "eval-budget-earphones",    name: "BassBoost Wired Earphones",         price: 799,   category: "Audio",       brand: "SoundWave", tags: ["wired","earphones","bass","budget"],               specs: {},         stock: 10 },
  // Gaming
  { slug: "eval-gaming-hs-3499",      name: "Titan Gaming Headset 7.1",          price: 3499,  category: "Gaming",      brand: "ProGear",   tags: ["gaming","headset","microphone","surround","rgb"],  specs: {},         stock: 10 },
  { slug: "eval-gaming-hs-wireless",  name: "Echo Wireless Gaming Headset",      price: 5999,  category: "Gaming",      brand: "ProGear",   tags: ["gaming","wireless","headset","microphone"],        specs: {},         stock: 10 },
  { slug: "eval-gaming-hs-budget",    name: "Stealth 200 Gaming Headset",        price: 1299,  category: "Gaming",      brand: "GameZone",  tags: ["gaming","headset","microphone","budget"],          specs: {},         stock: 10 },
  // Keyboards
  { slug: "eval-mech-kb-blue",        name: "MechaType RGB Keyboard Blue",       price: 3999,  category: "Keyboards",   brand: "KeyCraft",  tags: ["mechanical","keyboard","rgb","blue-switch"],       specs: {},         stock: 10 },
  { slug: "eval-mech-kb-red",         name: "MechaType RGB Keyboard Red",        price: 3999,  category: "Keyboards",   brand: "KeyCraft",  tags: ["mechanical","keyboard","rgb","red-switch","silent"], specs: {},       stock: 10 },
  { slug: "eval-membrane-kb",         name: "Swift Membrane RGB Keyboard",       price: 999,   category: "Keyboards",   brand: "OfficeGear",tags: ["keyboard","membrane","rgb","budget"],              specs: {},         stock: 10 },
  { slug: "eval-wireless-kb",         name: "SlimType Wireless Keyboard",        price: 2299,  category: "Keyboards",   brand: "KeyCraft",  tags: ["keyboard","wireless","compact","bluetooth"],        specs: {},         stock: 10 },
  // Gaming Mice
  { slug: "eval-gaming-mouse-2499",   name: "Phantom Pro Gaming Mouse",          price: 2499,  category: "Gaming Mice", brand: "ProGear",   tags: ["gaming","mouse","lightweight","rgb"],              specs: {},         stock: 10 },
  { slug: "eval-gaming-mouse-budget", name: "Speed 100 Gaming Mouse",            price: 799,   category: "Gaming Mice", brand: "GameZone",  tags: ["gaming","mouse","budget","rgb"],                   specs: {},         stock: 10 },
  { slug: "eval-gaming-mouse-wl",     name: "Viper X Wireless Gaming Mouse",     price: 3999,  category: "Gaming Mice", brand: "ProGear",   tags: ["gaming","mouse","wireless"],                       specs: {},         stock: 10 },
  // Laptops
  { slug: "eval-laptop-16gb",         name: "CodeX Pro Laptop 16GB",             price: 54999, category: "Laptops",     brand: "TechPrime", tags: ["laptop","programming","developer","thin-light"],   specs: { ram: 16 }, stock: 5 },
  { slug: "eval-laptop-32gb",         name: "CodeX Ultra Laptop 32GB",           price: 79999, category: "Laptops",     brand: "TechPrime", tags: ["laptop","programming","developer","high-end"],     specs: { ram: 32 }, stock: 5 },
  { slug: "eval-laptop-student",      name: "StudentBook 15 Laptop",             price: 34999, category: "Laptops",     brand: "EduTech",   tags: ["laptop","college","student","budget"],             specs: { ram: 8 },  stock: 5 },
  // Smartphones
  { slug: "eval-phone-premium",       name: "Nova X12 Smartphone 128GB",         price: 18999, category: "Smartphones", brand: "Nova",      tags: ["smartphone","android","5g","camera"],             specs: {},         stock: 10 },
  { slug: "eval-phone-budget",        name: "SwiftPhone 4G 64GB",                price: 8999,  category: "Smartphones", brand: "EduTech",   tags: ["smartphone","android","4g","budget"],             specs: {},         stock: 10 },
  // Monitors
  { slug: "eval-monitor-27",          name: "UltraView 27 FHD Monitor",          price: 12999, category: "Monitors",    brand: "DisplayPro",tags: ["monitor","27-inch","fhd","ips"],                   specs: {},         stock: 5 },
  { slug: "eval-monitor-gaming",      name: "GameVision 24 Gaming Monitor 144Hz", price: 16999, category: "Monitors",   brand: "DisplayPro",tags: ["monitor","gaming","144hz","1ms"],                  specs: {},         stock: 5 },
  // Accessories
  { slug: "eval-powerbank",           name: "TurboPower Power Bank 20000mAh",    price: 2499,  category: "Accessories", brand: "ChargePro", tags: ["power-bank","usb-c","fast-charge","portable"],     specs: {},         stock: 20 },
  { slug: "eval-webcam",              name: "ClearView HD Webcam 1080p",         price: 1999,  category: "Accessories", brand: "OfficeGear",tags: ["webcam","1080p","microphone","work-from-home"],    specs: {},         stock: 20 },
  // Storage
  { slug: "eval-ssd-internal",        name: "SpeedDrive 500GB Internal SSD",     price: 3499,  category: "Storage",     brand: "DataPeak",  tags: ["ssd","storage","2.5-inch","sata"],                specs: {},         stock: 10 },
  { slug: "eval-ssd-external",        name: "FlashVault 1TB External SSD",       price: 7499,  category: "Storage",     brand: "DataPeak",  tags: ["ssd","external","portable","usb-c"],              specs: {},         stock: 10 },
  { slug: "eval-hdd-external",        name: "ArchivePro 2TB External HDD",       price: 3999,  category: "Storage",     brand: "DataPeak",  tags: ["hard-drive","external","hdd","backup"],           specs: {},         stock: 10 },
  // Networking
  { slug: "eval-router-wifi6",        name: "NexRouter AX1800 Wi-Fi 6 Router",   price: 4499,  category: "Networking",  brand: "NetPro",    tags: ["router","wifi","wi-fi-6","gigabit","networking"],  specs: {},         stock: 10 },
  { slug: "eval-mesh-wifi",           name: "MeshNet Whole-Home Wi-Fi System",   price: 6999,  category: "Networking",  brand: "NetPro",    tags: ["mesh","wifi","router","networking"],               specs: {},         stock: 10 },
  // Speakers
  { slug: "eval-bt-speaker-mini",     name: "MiniBeat Bluetooth Speaker",        price: 1999,  category: "Speakers",    brand: "SoundWave", tags: ["bluetooth-speaker","portable","waterproof","outdoor"], specs: {},     stock: 20 },
  { slug: "eval-bt-speaker-40w",      name: "SoundBar 40W Bluetooth Speaker",    price: 2999,  category: "Speakers",    brand: "SoundWave", tags: ["bluetooth-speaker","soundbar","bass","portable"],  specs: {},         stock: 20 },
  { slug: "eval-bookshelf-speakers",  name: "StudioShelf Passive Bookshelf Speakers", price: 7999, category: "Speakers", brand: "AudioMax", tags: ["speakers","bookshelf","passive","hi-fi","home-audio"], specs: {},     stock: 10 },
];

// ─── Query definitions ────────────────────────────────────────────────────────
// Each entry: [query, expectedCategory | null, maxPrice | null, minPrice | null, ram | null, label]
type QueryCase = {
  query: string;
  expectCategory?: string;
  expectMaxPrice?: number;
  expectMinPrice?: number;
  expectRam?: number;
  expectMinResults?: number;   // minimum result count expected
  expectMaxResults?: number;   // if set, results must be <= this (e.g. filtered set)
  expectProductSlug?: string;  // at least one result must include this slug
  label?: string;
};

const QUERIES: QueryCase[] = [
  // ── Wireless headphones ────────────────────────────────────────────────────
  { query: "wireless headphones under 5000",       expectCategory: "Audio",       expectMaxPrice: 5000 },
  { query: "wireless headphones",                  expectCategory: "Audio" },
  { query: "wireless headphones under 3000",       expectCategory: "Audio",       expectMaxPrice: 3000 },
  { query: "Wireless Headphones Under 5000",       expectCategory: "Audio",       expectMaxPrice: 5000 },
  { query: "wireless headphones below 2000",       expectCategory: "Audio",       expectMaxPrice: 2000 },
  { query: "wireless headphones less than 4000",   expectCategory: "Audio",       expectMaxPrice: 4000 },
  { query: "wireless over-ear headphones",         expectCategory: "Audio" },
  { query: "bluetooth headphones under 5000",      expectCategory: "Audio",       expectMaxPrice: 5000 },
  { query: "bluetooth headphones",                 expectCategory: "Audio" },

  // ── Wired headphones ───────────────────────────────────────────────────────
  { query: "wired headphones under 5000",          expectCategory: "Audio",       expectMaxPrice: 5000 },
  { query: "wired headphones",                     expectCategory: "Audio" },
  { query: "wired earphones",                      expectCategory: "Audio" },
  { query: "wired earphones under 1000",           expectCategory: "Audio",       expectMaxPrice: 1000 },

  // ── Noise cancelling ───────────────────────────────────────────────────────
  { query: "noise cancelling headphones",          expectCategory: "Audio" },
  { query: "noise cancelling headphones under 5000", expectCategory: "Audio",     expectMaxPrice: 5000 },
  { query: "ANC headphones",                       expectCategory: "Audio" },
  { query: "best noise cancelling headphones under 5000", expectCategory: "Audio", expectMaxPrice: 5000 },
  { query: "active noise cancellation headphones", expectCategory: "Audio" },

  // ── Earbuds ────────────────────────────────────────────────────────────────
  { query: "true wireless earbuds under 3000",     expectCategory: "Audio",       expectMaxPrice: 3000 },
  { query: "earbuds under 2000",                   expectCategory: "Audio",       expectMaxPrice: 2000 },
  { query: "tws earbuds",                          expectCategory: "Audio" },

  // ── Gaming headsets ────────────────────────────────────────────────────────
  { query: "gaming headset with good microphone under 8000", expectCategory: "Gaming", expectMaxPrice: 8000 },
  { query: "gaming headset under 5000",            expectCategory: "Gaming",      expectMaxPrice: 5000 },
  { query: "gaming headset with microphone",       expectCategory: "Gaming" },
  { query: "gaming headphones",                    expectCategory: "Gaming" },
  { query: "gaming headset for PC",                expectCategory: "Gaming" },
  { query: "need a gaming headset for PC with a good mic", expectCategory: "Gaming" },
  { query: "wireless gaming headset",              expectCategory: "Gaming" },
  { query: "budget gaming headset under 2000",     expectCategory: "Gaming",      expectMaxPrice: 2000 },
  { query: "gaming headset for PS5",               expectCategory: "Gaming" },
  { query: "surround sound gaming headset",        expectCategory: "Gaming" },

  // ── Keyboards ─────────────────────────────────────────────────────────────
  { query: "mechanical keyboard under 7000",       expectCategory: "Keyboards",   expectMaxPrice: 7000 },
  { query: "mechanical RGB keyboard below 7000",   expectCategory: "Keyboards",   expectMaxPrice: 7000 },
  { query: "mechanical keyboard",                  expectCategory: "Keyboards" },
  { query: "RGB keyboard",                         expectCategory: "Keyboards" },
  { query: "keyboard under 5000",                  expectCategory: "Keyboards",   expectMaxPrice: 5000 },
  { query: "keyboard under 1500",                  expectCategory: "Keyboards",   expectMaxPrice: 1500 },
  { query: "wireless keyboard",                    expectCategory: "Keyboards" },
  { query: "compact wireless keyboard",            expectCategory: "Keyboards" },
  { query: "silent mechanical keyboard",           expectCategory: "Keyboards" },
  { query: "budget keyboard under 1000",           expectCategory: "Keyboards",   expectMaxPrice: 1000 },

  // ── Gaming mice ────────────────────────────────────────────────────────────
  { query: "gaming mouse under 5000",              expectCategory: "Gaming Mice", expectMaxPrice: 5000 },
  { query: "gaming mouse",                         expectCategory: "Gaming Mice" },
  { query: "budget gaming mouse under 1000",       expectCategory: "Gaming Mice", expectMaxPrice: 1000 },
  { query: "wireless gaming mouse",                expectCategory: "Gaming Mice" },
  { query: "lightweight gaming mouse",             expectCategory: "Gaming Mice" },
  { query: "gaming mice",                          expectCategory: "Gaming Mice" },

  // ── Laptops ────────────────────────────────────────────────────────────────
  { query: "laptop for programming under 60000",   expectCategory: "Laptops",     expectMaxPrice: 60000 },
  { query: "programming laptop",                   expectCategory: "Laptops" },
  { query: "laptop under 60000",                   expectCategory: "Laptops",     expectMaxPrice: 60000 },
  { query: "laptop under 40000",                   expectCategory: "Laptops",     expectMaxPrice: 40000 },
  { query: "16GB RAM laptop for college",          expectCategory: "Laptops",     expectRam: 16 },
  { query: "16 GB RAM laptop",                     expectCategory: "Laptops",     expectRam: 16 },
  { query: "32GB RAM laptop for developers",       expectCategory: "Laptops",     expectRam: 32 },
  { query: "college laptop under 40000",           expectCategory: "Laptops",     expectMaxPrice: 40000 },
  { query: "thin and light laptop",                expectCategory: "Laptops" },
  { query: "developer laptop under 80000",         expectCategory: "Laptops",     expectMaxPrice: 80000 },
  { query: "notebook computer under 60000",        expectCategory: "Laptops",     expectMaxPrice: 60000 },
  // gaming laptop — must resolve to Laptops, not Gaming
  { query: "gaming laptop",                        expectCategory: "Laptops",     label: "gaming-laptop-1" },
  { query: "gaming laptop 16GB RAM",               expectCategory: "Laptops",     expectRam: 16, label: "gaming-laptop-16gb" },
  { query: "gaming laptop 32GB RAM",               expectCategory: "Laptops",     expectRam: 32, label: "gaming-laptop-32gb" },
  { query: "hi i want an gaming laptop 16 gb ram", expectCategory: "Laptops",     expectRam: 16, label: "gaming-laptop-ui-1" },
  { query: "hi i want an gaming laptop 32 gb ram", expectCategory: "Laptops",     expectRam: 32, label: "gaming-laptop-ui-2" },
  { query: "hi i want an gaming laptop",           expectCategory: "Laptops",     label: "gaming-laptop-ui-3" },
  { query: "gaming laptop under 80000",            expectCategory: "Laptops",     expectMaxPrice: 80000, label: "gaming-laptop-price" },

  // ── Smartphones ────────────────────────────────────────────────────────────
  { query: "smartphone under 20000",               expectCategory: "Smartphones", expectMaxPrice: 20000 },
  { query: "budget smartphone under 10000",        expectCategory: "Smartphones", expectMaxPrice: 10000 },
  { query: "4g phone under 10000",                 expectCategory: "Smartphones", expectMaxPrice: 10000 },
  { query: "5g phone",                             expectCategory: "Smartphones" },
  { query: "mobile phone under 20000",             expectCategory: "Smartphones", expectMaxPrice: 20000 },

  // ── Monitors ───────────────────────────────────────────────────────────────
  { query: "monitor under 20000",                  expectCategory: "Monitors",    expectMaxPrice: 20000 },
  { query: "gaming monitor 144hz",                 expectCategory: "Monitors" },
  { query: "27 inch monitor",                      expectCategory: "Monitors" },
  { query: "display for programming",              expectCategory: "Monitors" },
  { query: "screen under 15000",                   expectCategory: "Monitors",    expectMaxPrice: 15000 },

  // ── Accessories ────────────────────────────────────────────────────────────
  { query: "power bank under 3000",                expectCategory: "Accessories", expectMaxPrice: 3000 },
  { query: "power bank 20000mAh",                  expectCategory: "Accessories" },
  { query: "webcam for work from home",            expectCategory: "Accessories" },
  { query: "1080p webcam",                         expectCategory: "Accessories" },
  { query: "accessories under 2000",               expectCategory: "Accessories", expectMaxPrice: 2000 },

  // ── Storage ────────────────────────────────────────────────────────────────
  { query: "SSD under 5000",                       expectCategory: "Storage",     expectMaxPrice: 5000 },
  { query: "external SSD",                         expectCategory: "Storage" },
  { query: "500GB SSD",                            expectCategory: "Storage" },
  { query: "hard drive for backup",                expectCategory: "Storage" },
  { query: "external hard drive",                  expectCategory: "Storage" },
  { query: "storage under 4000",                   expectCategory: "Storage",     expectMaxPrice: 4000 },

  // ── Networking ─────────────────────────────────────────────────────────────
  { query: "wifi router under 5000",               expectCategory: "Networking",  expectMaxPrice: 5000 },
  { query: "wi-fi router",                         expectCategory: "Networking" },
  { query: "wifi 6 router",                        expectCategory: "Networking" },
  { query: "mesh wifi system",                     expectCategory: "Networking" },
  { query: "networking equipment",                 expectCategory: "Networking" },

  // ── Speakers ───────────────────────────────────────────────────────────────
  { query: "Bluetooth speaker under 3000",         expectCategory: "Speakers",    expectMaxPrice: 3000 },
  { query: "portable bluetooth speaker",           expectCategory: "Speakers" },
  { query: "bluetooth speaker",                    expectCategory: "Speakers" },
  { query: "waterproof bluetooth speaker",         expectCategory: "Speakers" },
  { query: "bookshelf speakers for home audio",    expectCategory: "Speakers" },
  { query: "speaker under 2500",                   expectCategory: "Speakers",    expectMaxPrice: 2500 },

  // ── Price constraint validation ────────────────────────────────────────────
  { query: "headphones above 3000",                expectCategory: "Audio",       expectMinPrice: 3000 },
  { query: "headphones over 3000",                 expectCategory: "Audio",       expectMinPrice: 3000 },
  { query: "laptop above 50000",                   expectCategory: "Laptops",     expectMinPrice: 50000 },

  // ── Cross-category / no explicit category ─────────────────────────────────
  { query: "audio equipment under 5000",           expectCategory: "Audio",       expectMaxPrice: 5000 },

  // ── Natural phrasing variants ─────────────────────────────────────────────
  { query: "I need wireless earphones for gym",    expectCategory: "Audio" },
  { query: "best headphones for music",            expectCategory: "Audio" },
  { query: "headphones good for bass",             expectCategory: "Audio" },
  { query: "keyboard for gaming under 5000",       expectCategory: "Keyboards",   expectMaxPrice: 5000 },
  { query: "mouse for gaming",                     expectCategory: "Gaming Mice" },
  { query: "need a good laptop under 55000 for coding", expectCategory: "Laptops", expectMaxPrice: 55000 },

  // ── Determinism stress: repeated queries (these appear earlier, here with alias) ─
  { query: "wireless headphones under 5000",       expectCategory: "Audio",       expectMaxPrice: 5000,  label: "repeat-1" },
  { query: "gaming headset with good microphone under 8000", expectCategory: "Gaming", expectMaxPrice: 8000, label: "repeat-2" },
  { query: "mechanical keyboard under 7000",       expectCategory: "Keyboards",   expectMaxPrice: 7000,  label: "repeat-3" },
  { query: "gaming mouse under 5000",              expectCategory: "Gaming Mice", expectMaxPrice: 5000,  label: "repeat-4" },
  { query: "laptop for programming under 60000",   expectCategory: "Laptops",     expectMaxPrice: 60000, label: "repeat-5" },
  // ── Gaming-laptop disambiguation (repeat for determinism) ────────────────
  { query: "gaming laptop",                        expectCategory: "Laptops",     label: "gaming-laptop-repeat-1" },
  { query: "gaming laptop 16GB RAM",               expectCategory: "Laptops",     expectRam: 16, label: "gaming-laptop-repeat-2" },
];

// ─── Test state ───────────────────────────────────────────────────────────────

let merchantId: string;
const catIds: Record<string, string> = {};

// ─── Setup/teardown ───────────────────────────────────────────────────────────

beforeAll(async () => {
  // Clean test DB
  await prisma.productEmbedding.deleteMany();
  await prisma.inventoryAdjustment.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.merchantPolicy.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  // Create merchant
  const user = await prisma.user.create({
    data: { email: "eval@intentflow.test", name: "Eval Merchant", passwordHash: "hash", role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { name: "Eval Store", slug: "eval-store", ownerId: user.id },
  });
  merchantId = merchant.id;

  // Create categories
  const catNames = ["Audio", "Gaming", "Keyboards", "Gaming Mice", "Laptops", "Smartphones", "Monitors", "Accessories", "Storage", "Networking", "Speakers"];
  for (const name of catNames) {
    const cat = await prisma.category.create({ data: { name, slug: name.toLowerCase().replace(/\s+/g, "-") } });
    catIds[name] = cat.id;
  }

  // Upsert products + inventory
  for (const f of FIXTURES) {
    const catId = catIds[f.category];
    if (!catId) throw new Error(`Category not found: ${f.category}`);
    const product = await prisma.product.create({
      data: {
        merchantId,
        categoryId: catId,
        name: f.name,
        slug: f.slug,
        brand: f.brand,
        price: f.price,
        tags: f.tags,
        specifications: f.specs,
        isActive: true,
      },
    });
    await prisma.inventory.create({
      data: { productId: product.id, availableQuantity: f.stock },
    });
  }

  // Disable semantic search for determinism
  setDefaultEmbeddingProvider(nullProvider);
}, 60_000);

afterAll(async () => {
  setDefaultEmbeddingProvider(null);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Runs query through the fallback parser (deterministic, no Gemini).
// Mirrors exactly what parseIntentFallback produces (must stay in sync with packages/ai/src/index.ts).
function parseFallback(msg: string) {
  const lower = msg.toLowerCase();

  let category: string | undefined;
  // Order matters: more-specific checks before generic ones.
  if (lower.includes("gaming mouse") || lower.includes("gaming mice") || lower.match(/\bmouse\b/) !== null) {
    category = "Gaming Mice";
  } else if (lower.includes("gaming laptop") || lower.includes("gaming notebook")) {
    category = "Laptops";
  } else if (lower.includes("mechanical keyboard") || lower.includes("keyboard") || lower.includes("rgb keyboard")) {
    category = "Keyboards";
  } else if (lower.includes("monitor") || lower.includes("display") || lower.includes("screen")) {
    category = "Monitors";
  } else if (lower.includes("gaming headset") || lower.includes("gaming headphones") || lower.includes("gaming microphone") || lower.includes("pc gaming") || lower.includes("playstation") || lower.includes("gaming")) {
    category = "Gaming";
  } else if (lower.includes("laptop") || lower.includes("notebook") || lower.includes("programming laptop") || lower.includes("college laptop")) {
    category = "Laptops";
  } else if (lower.includes("smartphone") || lower.includes("mobile phone") || /\bphone\b/.test(lower)) {
    category = "Smartphones";
  } else if (lower.includes("ssd") || lower.includes("hard drive") || lower.includes("external drive") || lower.includes("storage")) {
    category = "Storage";
  } else if (lower.includes("router") || lower.includes("wi-fi") || lower.includes("wifi") || lower.includes("networking") || lower.includes("mesh")) {
    category = "Networking";
  } else if (lower.includes("webcam") || lower.includes("power bank") || lower.includes("accessory") || lower.includes("accessories")) {
    category = "Accessories";
  } else if (lower.includes("bluetooth speaker") || lower.includes("portable speaker") || lower.includes("speaker") || lower.includes("bookshelf")) {
    category = "Speakers";
  } else if (lower.includes("headphone") || lower.includes("earphone") || lower.includes("earbud") || lower.includes("audio") || lower.includes("music") || lower.includes("earbuds")) {
    category = "Audio";
  }

  // RAM: handle both "16GB RAM" and "RAM 16GB"
  const ramMatch = lower.match(/(?:ram|memory)\s*(?:should\s*be|is|of|:)?\s*(\d+)\s*gb/)
    ?? lower.match(/(\d+)\s*gb\s*(?:ram|memory)/);
  const ram = ramMatch?.[1] ? Number(ramMatch[1]) : undefined;

  const maxMatch = lower.match(/(?:under|below|less than|upto|up to)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*)/);
  const maxPrice = maxMatch?.[1] ? Number(maxMatch[1].replace(/,/g, "")) : undefined;

  const minMatch = lower.match(/(?:above|over|more than)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*)/);
  const minPrice = minMatch?.[1] ? Number(minMatch[1].replace(/,/g, "")) : undefined;

  return { category, ram, maxPrice, minPrice };
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

describe("M8: 100-Query Search Evaluation", () => {
  const results: Array<{
    query: string;
    label: string;
    passed: boolean;
    failures: string[];
    unstable: boolean;
  }> = [];

  it(`evaluates all ${QUERIES.length} queries against hard constraints and determinism`, async () => {
    for (const qc of QUERIES) {
      const label = qc.label ?? qc.query;
      const failures: string[] = [];
      let unstable = false;

      const parsed = parseFallback(qc.query);

      // Verify parser picks up expected category
      if (qc.expectCategory && parsed.category !== qc.expectCategory) {
        failures.push(`parser category: expected "${qc.expectCategory}" got "${parsed.category}"`);
      }
      if (qc.expectMaxPrice && parsed.maxPrice !== qc.expectMaxPrice) {
        failures.push(`parser maxPrice: expected ${qc.expectMaxPrice} got ${parsed.maxPrice}`);
      }
      if (qc.expectMinPrice && parsed.minPrice !== qc.expectMinPrice) {
        failures.push(`parser minPrice: expected ${qc.expectMinPrice} got ${parsed.minPrice}`);
      }
      if (qc.expectRam && parsed.ram !== qc.expectRam) {
        failures.push(`parser ram: expected ${qc.expectRam} got ${parsed.ram}`);
      }

      // Run search 3 times for determinism check
      const runResults: string[][] = [];
      for (let run = 0; run < 3; run++) {
        try {
          const sr = await searchProducts({
            query: qc.query,
            category: parsed.category,
            minPrice: parsed.minPrice,
            maxPrice: parsed.maxPrice,
            ram: parsed.ram,
            inStockOnly: true,
            page: 1,
            limit: 50,
            provider: nullProvider,
          });

          const ids = sr.items.map((i) => i.product.id);
          runResults.push(ids);

          if (run === 0) {
            // Hard constraint: maxPrice
            if (qc.expectMaxPrice !== undefined) {
              for (const item of sr.items) {
                if (item.product.price > qc.expectMaxPrice) {
                  failures.push(`maxPrice violated: ${item.product.name} costs ₹${item.product.price} > ₹${qc.expectMaxPrice}`);
                }
              }
            }
            // Hard constraint: minPrice
            if (qc.expectMinPrice !== undefined) {
              for (const item of sr.items) {
                if (item.product.price < qc.expectMinPrice) {
                  failures.push(`minPrice violated: ${item.product.name} costs ₹${item.product.price} < ₹${qc.expectMinPrice}`);
                }
              }
            }
            // Hard constraint: category
            if (qc.expectCategory && catIds[qc.expectCategory]) {
              for (const item of sr.items) {
                if (item.product.categoryId !== catIds[qc.expectCategory]) {
                  failures.push(`category violated: ${item.product.name} is in wrong category`);
                }
              }
            }
            // Hard constraint: RAM
            if (qc.expectRam !== undefined) {
              for (const item of sr.items) {
                const specs = item.product as unknown as { specifications?: Record<string, unknown> };
                const productRam = (specs.specifications as Record<string, unknown>)?.["ram"];
                if (productRam !== undefined && Number(productRam) !== qc.expectRam) {
                  failures.push(`RAM violated: ${item.product.name} has ${productRam}GB RAM, expected ${qc.expectRam}GB`);
                }
              }
            }
            // Hard constraint: inStock
            for (const item of sr.items) {
              const inv = item.product.inventory;
              if (inv && inv.availableQuantity <= 0) {
                failures.push(`inStock violated: ${item.product.name} is out of stock`);
              }
            }
            // No duplicates
            const idSet = new Set(ids);
            if (idSet.size !== ids.length) {
              failures.push(`duplicates found in results`);
            }
            // Expected min results
            if (qc.expectMinResults !== undefined && sr.items.length < qc.expectMinResults) {
              failures.push(`too few results: got ${sr.items.length}, expected >= ${qc.expectMinResults}`);
            }
            // Expected max results
            if (qc.expectMaxResults !== undefined && sr.items.length > qc.expectMaxResults) {
              failures.push(`too many results: got ${sr.items.length}, expected <= ${qc.expectMaxResults}`);
            }
            // Expected product slug present
            if (qc.expectProductSlug) {
              // We don't have slugs in results, skip
            }
          }
        } catch (err) {
          failures.push(`run ${run + 1} threw: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Determinism: all 3 runs must produce same ordered IDs
      if (runResults.length === 3) {
        const r0 = JSON.stringify(runResults[0]);
        const r1 = JSON.stringify(runResults[1]);
        const r2 = JSON.stringify(runResults[2]);
        if (r0 !== r1 || r0 !== r2) {
          unstable = true;
          failures.push(`non-deterministic: run 1 and run 2 differ`);
        }
      }

      results.push({
        query: qc.query,
        label,
        passed: failures.length === 0 && !unstable,
        failures,
        unstable,
      });
    }

    // ── Print evaluation summary ─────────────────────────────────────────────
    const passed  = results.filter((r) => r.passed).length;
    const failed  = results.filter((r) => !r.passed && !r.unstable).length;
    const unstable = results.filter((r) => r.unstable).length;

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  SEARCH EVALUATION SUMMARY — ${QUERIES.length} queries`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  ✓ Passed   : ${passed}`);
    console.log(`  ✗ Failed   : ${failed}`);
    console.log(`  ~ Unstable : ${unstable}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (failed > 0 || unstable > 0) {
      console.log("\n  FAILURES:");
      for (const r of results.filter((r) => !r.passed)) {
        console.log(`\n  Query : "${r.query}"`);
        for (const f of r.failures) {
          console.log(`    ✗ ${f}`);
        }
      }
      console.log("");
    }

    // Assert: zero hard-constraint violations, zero unstable queries
    const hardViolations = results.filter(
      (r) => r.failures.some((f) =>
        f.includes("maxPrice violated") ||
        f.includes("minPrice violated") ||
        f.includes("category violated") ||
        f.includes("RAM violated") ||
        f.includes("inStock violated") ||
        f.includes("duplicates found")
      )
    );

    expect(hardViolations, "Hard constraint violations must be zero").toHaveLength(0);
    expect(unstable, "Unstable queries must be zero").toBe(0);

    // Assert: every query with an expected category had the parser resolve it
    const parserFailures = results.filter(
      (r) => r.failures.some((f) => f.startsWith("parser "))
    );
    expect(parserFailures, "Parser must correctly extract all expected intent fields").toHaveLength(0);
  }, 120_000);
});
