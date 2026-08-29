/**
 * seedCatalog.ts
 *
 * Idempotent seed script for the IntentFlow demo catalog.
 *
 * Safety:
 * - Never deletes existing data
 * - Uses stable slugs + upsert — safe to run multiple times
 * - Refuses to run if DATABASE_URL contains "intentflow_test"
 *   (test database should only contain test fixtures)
 *
 * Usage:
 *   # From repo root after building:
 *   node --env-file=.env dist/apps/api/src/scripts/seedCatalog.js
 *
 *   # Or via npm script (add to apps/api/package.json if desired):
 *   npm run seed --workspace=@intentflow/api
 */

import "dotenv/config";
import prisma from "@intentflow/database";
import bcrypt from "bcryptjs";

// ─── Safety guard ─────────────────────────────────────────────────────────────

const dbUrl = process.env["DATABASE_URL"] ?? "";
if (dbUrl.includes("intentflow_test")) {
  console.error(
    "[SEED] Refusing to seed: DATABASE_URL points to intentflow_test.\n" +
      "The seed script is for the development/production catalog only."
  );
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function upsertCategory(name: string) {
  const slug = toSlug(name);
  return prisma.category.upsert({
    where: { slug },
    create: { name, slug },
    update: { name },
  });
}

async function upsertMerchant(
  email: string,
  merchantSlug: string,
  merchantName: string,
  spendLimit: number
) {
  // Upsert user
  const passwordHash = await bcrypt.hash("IntentFlow2025!", 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, name: merchantName + " Owner", role: "MERCHANT" },
    update: {},
  });

  // Upsert merchant
  const merchant = await prisma.merchant.upsert({
    where: { slug: merchantSlug },
    create: { name: merchantName, slug: merchantSlug, ownerId: user.id },
    update: { name: merchantName },
  });

  // Upsert policy
  await prisma.merchantPolicy.upsert({
    where: { merchantId: merchant.id },
    create: {
      merchantId: merchant.id,
      currency: "INR",
      defaultAutonomousSpendLimit: spendLimit,
    },
    update: { defaultAutonomousSpendLimit: spendLimit },
  });

  return merchant;
}

interface ProductSeed {
  slug: string;
  name: string;
  brand: string;
  description: string;
  price: number;
  currency?: string;
  categoryId: string;
  merchantId: string;
  tags: string[];
  specifications: Record<string, string | number>;
  deliveryInfo: string;
  returnPolicy: string;
  stock: number;
}

async function upsertProduct(p: ProductSeed) {
  // Upsert product (unique on merchantId+slug)
  const product = await prisma.product.upsert({
    where: { merchantId_slug: { merchantId: p.merchantId, slug: p.slug } },
    create: {
      merchantId: p.merchantId,
      categoryId: p.categoryId,
      name: p.name,
      slug: p.slug,
      brand: p.brand,
      description: p.description,
      price: p.price,
      currency: p.currency ?? "INR",
      tags: p.tags,
      specifications: p.specifications,
      deliveryInfo: p.deliveryInfo,
      returnPolicy: p.returnPolicy,
      isActive: true,
    },
    update: {
      name: p.name,
      categoryId: p.categoryId,
      brand: p.brand,
      description: p.description,
      price: p.price,
      tags: p.tags,
      specifications: p.specifications,
      deliveryInfo: p.deliveryInfo,
      returnPolicy: p.returnPolicy,
      isActive: true,
    },
  });

  // Upsert inventory
  await prisma.inventory.upsert({
    where: { productId: product.id },
    create: { productId: product.id, availableQuantity: p.stock },
    update: { availableQuantity: p.stock },
  });

  return product;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("IntentFlow — Demo Catalog Seed");
  console.log("==============================");
  console.log(`DB: ${dbUrl.replace(/:[^:@]+@/, ":***@")}\n`);

  // ── Merchants ──────────────────────────────────────────────────────────────
  console.log("Upserting demo merchants...");

  const merchantA = await upsertMerchant(
    "demo-merchant@intentflow.dev",
    "intentflow-demo-store",
    "IntentFlow Demo Store",
    5000
  );

  const merchantB = await upsertMerchant(
    "demo-merchant-b@intentflow.dev",
    "intentflow-electronics",
    "IntentFlow Electronics",
    10000
  );

  console.log(`  ✓ ${merchantA.name} (id: ${merchantA.id})`);
  console.log(`  ✓ ${merchantB.name} (id: ${merchantB.id})\n`);

  // ── Categories ─────────────────────────────────────────────────────────────
  console.log("Upserting categories...");

  const cats = await Promise.all([
    upsertCategory("Audio"),
    upsertCategory("Gaming"),
    upsertCategory("Keyboards"),
    upsertCategory("Gaming Mice"),
    upsertCategory("Laptops"),
    upsertCategory("Smartphones"),
    upsertCategory("Monitors"),
    upsertCategory("Accessories"),
    upsertCategory("Storage"),
    upsertCategory("Networking"),
    upsertCategory("Speakers"),
  ]);

  const catMap = Object.fromEntries(cats.map((c) => [c.name, c.id]));
  console.log(`  ✓ ${cats.map((c) => c.name).join(", ")}\n`);

  // ── Products ───────────────────────────────────────────────────────────────
  console.log("Upserting products...");

  const DELIVERY = "Ships within 1-2 business days. Free delivery on orders above ₹499.";
  const RETURN_7 = "7-day return policy for defective or damaged items.";
  const RETURN_14 = "14-day hassle-free return for any reason.";

  const products: ProductSeed[] = [
    // ── Audio ──────────────────────────────────────────────────────────────
    {
      slug: "nova-wireless-headphones",
      name: "Nova Wireless Over-Ear Headphones",
      brand: "SoundWave",
      description:
        "Comfortable over-ear wireless headphones with 30-hour battery life and deep bass. Bluetooth 5.3 with multipoint connection for two devices simultaneously.",
      price: 2499,
      categoryId: catMap["Audio"]!,
      merchantId: merchantA.id,
      tags: ["wireless", "bluetooth", "over-ear", "bass", "headphones"],
      specifications: { connectivity: "Bluetooth 5.3", batteryLife: "30 hours", driverSize: "40mm", weight: "220g" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 75,
    },
    {
      slug: "clarity-anc-headphones",
      name: "Clarity ANC Noise-Cancelling Headphones",
      brand: "AudioMax",
      description:
        "Active noise cancellation headphones with hybrid ANC technology, 40-hour battery and transparency mode. Folds flat for travel.",
      price: 4999,
      categoryId: catMap["Audio"]!,
      merchantId: merchantA.id,
      tags: ["anc", "noise-cancelling", "wireless", "bluetooth", "over-ear", "travel"],
      specifications: { anc: "Hybrid ANC", batteryLife: "40 hours", connectivity: "Bluetooth 5.2", weight: "250g" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 40,
    },
    {
      slug: "pulse-earbuds-tws",
      name: "Pulse Pro True Wireless Earbuds",
      brand: "SoundWave",
      description:
        "Lightweight true wireless earbuds with 8-hour playtime per charge and 32 hours total with case. IPX5 sweat resistant. Touch controls.",
      price: 1799,
      categoryId: catMap["Audio"]!,
      merchantId: merchantA.id,
      tags: ["earbuds", "tws", "wireless", "ipx5", "earphones", "bluetooth"],
      specifications: { batteryLife: "8+32 hours", connectivity: "Bluetooth 5.2", waterResistance: "IPX5", weight: "5g per bud" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 120,
    },
    {
      slug: "studio-wired-headphones",
      name: "Studio Pro Wired Headphones",
      brand: "AudioMax",
      description:
        "Professional studio-grade over-ear wired headphones with flat frequency response for accurate audio monitoring. 3.5mm + 6.35mm adapter included.",
      price: 3499,
      categoryId: catMap["Audio"]!,
      merchantId: merchantB.id,
      tags: ["wired", "studio", "monitoring", "over-ear", "professional", "headphones"],
      specifications: { driverSize: "45mm", frequencyResponse: "15Hz-28kHz", impedance: "32Ω", cable: "1.5m detachable" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 30,
    },
    {
      slug: "bass-boost-earphones",
      name: "BassBoost Wired Earphones",
      brand: "SoundWave",
      description:
        "In-ear wired earphones tuned for enhanced bass with braided cable, in-line mic and volume control. Universal 3.5mm jack.",
      price: 799,
      categoryId: catMap["Audio"]!,
      merchantId: merchantA.id,
      tags: ["wired", "earphones", "bass", "in-ear", "mic", "budget"],
      specifications: { driverSize: "10mm", impedance: "16Ω", cable: "1.2m", connector: "3.5mm" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 200,
    },

    // ── Gaming ─────────────────────────────────────────────────────────────
    {
      slug: "titan-gaming-headset",
      name: "Titan Gaming Headset 7.1",
      brand: "ProGear",
      description:
        "Surround-sound gaming headset with detachable noise-cancelling microphone, RGB lighting and USB/3.5mm dual connection. Compatible with PC, PS5 and Xbox.",
      price: 3499,
      categoryId: catMap["Gaming"]!,
      merchantId: merchantA.id,
      tags: ["gaming", "headset", "microphone", "surround", "rgb", "pc", "ps5", "xbox"],
      specifications: { audioChannels: "7.1 virtual surround", driverSize: "50mm", microphone: "Detachable noise-cancelling", connection: "USB + 3.5mm" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 55,
    },
    {
      slug: "echo-wireless-gaming-headset",
      name: "Echo Wireless Gaming Headset",
      brand: "ProGear",
      description:
        "Low-latency 2.4GHz wireless gaming headset with 20-hour battery, clear boom microphone and memory foam ear cushions.",
      price: 5999,
      categoryId: catMap["Gaming"]!,
      merchantId: merchantB.id,
      tags: ["gaming", "wireless", "headset", "microphone", "2.4ghz", "pc", "ps5"],
      specifications: { connectivity: "2.4GHz wireless", batteryLife: "20 hours", microphone: "Boom noise-cancelling", driverSize: "40mm" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 35,
    },
    {
      slug: "stealth-gaming-headset-budget",
      name: "Stealth 200 Gaming Headset",
      brand: "GameZone",
      description:
        "Affordable gaming headset with clear stereo sound and adjustable boom microphone. Great for PC gaming and Discord calls.",
      price: 1299,
      categoryId: catMap["Gaming"]!,
      merchantId: merchantA.id,
      tags: ["gaming", "headset", "microphone", "budget", "pc", "stereo"],
      specifications: { audioChannels: "Stereo", driverSize: "40mm", microphone: "Adjustable boom", connection: "3.5mm" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 90,
    },

    // ── Keyboards ─────────────────────────────────────────────────────────
    {
      slug: "mecha-rgb-keyboard-blue",
      name: "MechaType RGB Mechanical Keyboard — Blue Switches",
      brand: "KeyCraft",
      description:
        "Tenkeyless mechanical keyboard with clicky blue switches, per-key RGB lighting and aluminium top plate. USB-C detachable cable.",
      price: 3999,
      categoryId: catMap["Keyboards"]!,
      merchantId: merchantA.id,
      tags: ["mechanical", "keyboard", "rgb", "blue-switch", "tenkeyless", "tkl"],
      specifications: { switchType: "Blue (clicky)", layout: "Tenkeyless", backlight: "Per-key RGB", connection: "USB-C" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 45,
    },
    {
      slug: "mecha-rgb-keyboard-red",
      name: "MechaType RGB Mechanical Keyboard — Red Switches",
      brand: "KeyCraft",
      description:
        "Tenkeyless mechanical keyboard with smooth linear red switches, per-key RGB lighting and aluminium top plate for silent typing.",
      price: 3999,
      categoryId: catMap["Keyboards"]!,
      merchantId: merchantA.id,
      tags: ["mechanical", "keyboard", "rgb", "red-switch", "tenkeyless", "silent", "linear"],
      specifications: { switchType: "Red (linear)", layout: "Tenkeyless", backlight: "Per-key RGB", connection: "USB-C" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 40,
    },
    {
      slug: "budget-membrane-keyboard",
      name: "Swift Membrane RGB Keyboard",
      brand: "OfficeGear",
      description:
        "Full-size membrane keyboard with rainbow RGB backlight, spill-resistant design and multimedia keys. Plug-and-play USB.",
      price: 999,
      categoryId: catMap["Keyboards"]!,
      merchantId: merchantA.id,
      tags: ["keyboard", "membrane", "rgb", "full-size", "budget"],
      specifications: { switchType: "Membrane", layout: "Full-size", backlight: "Rainbow RGB", connection: "USB-A" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 150,
    },
    {
      slug: "compact-wireless-keyboard",
      name: "SlimType Wireless Compact Keyboard",
      brand: "KeyCraft",
      description:
        "Compact 75% wireless keyboard with Bluetooth 5.0 and 2.4GHz dongle, 2000mAh rechargeable battery, white backlight.",
      price: 2299,
      categoryId: catMap["Keyboards"]!,
      merchantId: merchantB.id,
      tags: ["keyboard", "wireless", "compact", "bluetooth", "75-percent"],
      specifications: { layout: "75%", connectivity: "Bluetooth 5.0 + 2.4GHz", battery: "2000mAh", backlight: "White LED" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 60,
    },

    // ── Gaming Mice ────────────────────────────────────────────────────────
    {
      slug: "phantom-gaming-mouse",
      name: "Phantom Pro Gaming Mouse",
      brand: "ProGear",
      description:
        "Lightweight gaming mouse at 68g with 26000 DPI optical sensor, 6 programmable buttons and RGB logo. USB-A wired.",
      price: 2499,
      categoryId: catMap["Gaming Mice"]!,
      merchantId: merchantA.id,
      tags: ["gaming", "mouse", "lightweight", "rgb", "programmable", "high-dpi"],
      specifications: { sensor: "Optical 26000 DPI", weight: "68g", buttons: "6 programmable", connection: "USB-A wired" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 70,
    },
    {
      slug: "speed-budget-mouse",
      name: "Speed 100 Gaming Mouse",
      brand: "GameZone",
      description:
        "Ergonomic budget gaming mouse with 6400 DPI adjustable sensor and 7-colour RGB breathing light. Great for casual gaming.",
      price: 799,
      categoryId: catMap["Gaming Mice"]!,
      merchantId: merchantA.id,
      tags: ["gaming", "mouse", "budget", "rgb", "ergonomic"],
      specifications: { sensor: "Optical 6400 DPI", weight: "90g", buttons: "5", connection: "USB-A wired" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 130,
    },
    {
      slug: "viper-wireless-gaming-mouse",
      name: "Viper X Wireless Gaming Mouse",
      brand: "ProGear",
      description:
        "Wireless gaming mouse with 35-hour battery, 16000 DPI sensor, 5 programmable buttons and ambidextrous design.",
      price: 3999,
      categoryId: catMap["Gaming Mice"]!,
      merchantId: merchantB.id,
      tags: ["gaming", "mouse", "wireless", "ambidextrous", "rechargeable"],
      specifications: { sensor: "Optical 16000 DPI", battery: "35 hours", weight: "76g", buttons: "5 programmable", connectivity: "2.4GHz wireless" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 50,
    },

    // ── Laptops ────────────────────────────────────────────────────────────
    {
      slug: "codeX-laptop-16gb",
      name: "CodeX Pro Laptop — 16GB RAM",
      brand: "TechPrime",
      description:
        "Thin-and-light programming laptop with 16GB DDR5 RAM, 512GB NVMe SSD, Intel Core i5 12th Gen and 14-inch FHD IPS display. Excellent for developers.",
      price: 54999,
      categoryId: catMap["Laptops"]!,
      merchantId: merchantB.id,
      tags: ["laptop", "programming", "developer", "thin-light", "16gb-ram", "ssd"],
      specifications: { ram: 16, storage: "512GB NVMe SSD", processor: "Intel Core i5-1235U", display: "14-inch FHD IPS", battery: "12 hours" },
      deliveryInfo: "Ships within 2-3 business days. Free delivery.",
      returnPolicy: RETURN_14,
      stock: 20,
    },
    {
      slug: "codeX-laptop-32gb",
      name: "CodeX Ultra Laptop — 32GB RAM",
      brand: "TechPrime",
      description:
        "High-performance developer laptop with 32GB DDR5 RAM, 1TB NVMe SSD and Intel Core i7 13th Gen. Handles heavy compilation and Docker workloads.",
      price: 79999,
      categoryId: catMap["Laptops"]!,
      merchantId: merchantB.id,
      tags: ["laptop", "programming", "developer", "32gb-ram", "ssd", "high-performance"],
      specifications: { ram: 32, storage: "1TB NVMe SSD", processor: "Intel Core i7-1355U", display: "15.6-inch 2K IPS", battery: "10 hours" },
      deliveryInfo: "Ships within 2-3 business days. Free delivery.",
      returnPolicy: RETURN_14,
      stock: 12,
    },
    {
      slug: "studentbook-laptop",
      name: "StudentBook 15 Laptop",
      brand: "EduTech",
      description:
        "Affordable college laptop with 8GB RAM, 256GB SSD and AMD Ryzen 5 processor. Long 10-hour battery and backlit keyboard.",
      price: 34999,
      categoryId: catMap["Laptops"]!,
      merchantId: merchantA.id,
      tags: ["laptop", "college", "student", "budget", "8gb-ram", "amd"],
      specifications: { ram: 8, storage: "256GB SSD", processor: "AMD Ryzen 5 5500U", display: "15.6-inch FHD", battery: "10 hours" },
      deliveryInfo: "Ships within 2-3 business days. Free delivery.",
      returnPolicy: RETURN_14,
      stock: 25,
    },

    // ── Smartphones ────────────────────────────────────────────────────────
    {
      slug: "nova-x12-smartphone",
      name: "Nova X12 Smartphone — 128GB",
      brand: "Nova Mobile",
      description:
        "Mid-range smartphone with 6.6-inch AMOLED display, 50MP triple camera, 5000mAh battery and 33W fast charging. Android 14.",
      price: 18999,
      categoryId: catMap["Smartphones"]!,
      merchantId: merchantB.id,
      tags: ["smartphone", "android", "5g", "camera", "amoled", "fast-charging"],
      specifications: { storage: "128GB", ram: 8, display: "6.6-inch AMOLED 120Hz", camera: "50MP + 12MP + 5MP", battery: "5000mAh 33W" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 35,
    },
    {
      slug: "budget-phone-64gb",
      name: "SwiftPhone 4G — 64GB",
      brand: "EduTech",
      description:
        "Reliable 4G smartphone for everyday tasks with 6.5-inch HD display, 13MP camera and 4500mAh battery. Compact and durable.",
      price: 8999,
      categoryId: catMap["Smartphones"]!,
      merchantId: merchantA.id,
      tags: ["smartphone", "android", "4g", "budget", "basic"],
      specifications: { storage: "64GB", ram: 4, display: "6.5-inch HD+", camera: "13MP + 2MP", battery: "4500mAh" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 60,
    },

    // ── Monitors ───────────────────────────────────────────────────────────
    {
      slug: "ultraview-27-monitor",
      name: "UltraView 27 FHD Monitor",
      brand: "DisplayPro",
      description:
        "27-inch Full HD IPS monitor with 75Hz refresh rate, ultra-thin bezels and AMD FreeSync. HDMI + DisplayPort inputs.",
      price: 12999,
      categoryId: catMap["Monitors"]!,
      merchantId: merchantB.id,
      tags: ["monitor", "27-inch", "fhd", "ips", "freesync", "display"],
      specifications: { size: "27 inch", resolution: "1920x1080 FHD", refreshRate: "75Hz", panel: "IPS", inputs: "HDMI + DisplayPort" },
      deliveryInfo: "Ships in 3-5 business days. Free delivery.",
      returnPolicy: RETURN_14,
      stock: 20,
    },
    {
      slug: "gamevision-24-144hz",
      name: "GameVision 24 Gaming Monitor — 144Hz",
      brand: "DisplayPro",
      description:
        "24-inch Full HD gaming monitor with 144Hz refresh rate, 1ms response time and AMD FreeSync. Built for competitive gaming.",
      price: 16999,
      categoryId: catMap["Monitors"]!,
      merchantId: merchantB.id,
      tags: ["monitor", "gaming", "24-inch", "144hz", "1ms", "freesync", "competitive"],
      specifications: { size: "24 inch", resolution: "1920x1080 FHD", refreshRate: "144Hz", responseTime: "1ms", panel: "TN" },
      deliveryInfo: "Ships in 3-5 business days. Free delivery.",
      returnPolicy: RETURN_14,
      stock: 18,
    },

    // ── Accessories ────────────────────────────────────────────────────────
    {
      slug: "usbc-power-bank-20000",
      name: "TurboPower USB-C Power Bank 20000mAh",
      brand: "ChargePro",
      description:
        "High-capacity 20000mAh power bank with 65W USB-C PD and 18W USB-A QC 3.0 output. Charges a laptop once or a phone four times.",
      price: 2499,
      categoryId: catMap["Accessories"]!,
      merchantId: merchantA.id,
      tags: ["power-bank", "usb-c", "pd", "65w", "fast-charge", "portable"],
      specifications: { capacity: "20000mAh", usbCOutput: "65W PD", usbAOutput: "18W QC 3.0", weight: "430g" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 80,
    },
    {
      slug: "hd-webcam-1080p",
      name: "ClearView HD Webcam 1080p",
      brand: "OfficeGear",
      description:
        "1080p 30fps webcam with built-in stereo microphone, auto light correction and universal clip for monitors or laptops.",
      price: 1999,
      categoryId: catMap["Accessories"]!,
      merchantId: merchantA.id,
      tags: ["webcam", "1080p", "microphone", "streaming", "work-from-home", "video-call"],
      specifications: { resolution: "1920x1080 30fps", microphone: "Built-in stereo", connection: "USB-A", fieldOfView: "90 degrees" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 65,
    },

    // ── Storage ────────────────────────────────────────────────────────────
    {
      slug: "speedrive-ssd-500gb",
      name: "SpeedDrive 500GB Internal SSD",
      brand: "DataPeak",
      description:
        "2.5-inch SATA SSD with 550MB/s sequential read speed. Ideal for laptop upgrades to dramatically improve boot and app load times.",
      price: 3499,
      categoryId: catMap["Storage"]!,
      merchantId: merchantB.id,
      tags: ["ssd", "storage", "2.5-inch", "sata", "laptop-upgrade", "internal"],
      specifications: { capacity: "500GB", formFactor: "2.5-inch SATA", readSpeed: "550 MB/s", writeSpeed: "500 MB/s" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 50,
    },
    {
      slug: "flashvault-external-1tb",
      name: "FlashVault 1TB External SSD",
      brand: "DataPeak",
      description:
        "Portable external SSD with USB-C 3.2 Gen 2 interface delivering 1050MB/s transfer speeds. Shock-resistant and bus-powered.",
      price: 7499,
      categoryId: catMap["Storage"]!,
      merchantId: merchantB.id,
      tags: ["ssd", "external", "portable", "usb-c", "1tb", "fast-transfer"],
      specifications: { capacity: "1TB", interface: "USB-C 3.2 Gen 2", readSpeed: "1050 MB/s", weight: "45g" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 30,
    },
    {
      slug: "archive-hdd-2tb",
      name: "ArchivePro 2TB External Hard Drive",
      brand: "DataPeak",
      description:
        "2TB portable hard drive for backup and bulk storage. USB 3.0 bus-powered, compatible with Windows, Mac and Linux.",
      price: 3999,
      categoryId: catMap["Storage"]!,
      merchantId: merchantA.id,
      tags: ["hard-drive", "external", "hdd", "2tb", "backup", "portable"],
      specifications: { capacity: "2TB", interface: "USB 3.0", rotationalSpeed: "5400 RPM", weight: "140g" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 45,
    },

    // ── Networking ─────────────────────────────────────────────────────────
    {
      slug: "nexrouter-ax1800-wifi6",
      name: "NexRouter AX1800 Wi-Fi 6 Router",
      brand: "NetPro",
      description:
        "Dual-band Wi-Fi 6 router with AX1800 speed (1200Mbps + 574Mbps), 4 Gigabit LAN ports and MU-MIMO for up to 40 connected devices.",
      price: 4499,
      categoryId: catMap["Networking"]!,
      merchantId: merchantB.id,
      tags: ["router", "wifi", "wi-fi-6", "ax1800", "gigabit", "networking"],
      specifications: { standard: "Wi-Fi 6 (802.11ax)", speed: "AX1800", bands: "Dual-band 2.4GHz+5GHz", ports: "4x Gigabit LAN + 1 WAN" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 40,
    },
    {
      slug: "mesh-wifi-system",
      name: "MeshNet Whole-Home Wi-Fi System (2-pack)",
      brand: "NetPro",
      description:
        "Whole-home mesh Wi-Fi system covering up to 370 sq. metres. AC1200 speed with seamless roaming and simple app management.",
      price: 6999,
      categoryId: catMap["Networking"]!,
      merchantId: merchantB.id,
      tags: ["mesh", "wifi", "whole-home", "router", "networking", "seamless-roaming"],
      specifications: { standard: "Wi-Fi 5 (AC1200)", coverage: "370 sq. metres (2 units)", nodes: "2", management: "Mobile app" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_14,
      stock: 25,
    },

    // ── Speakers ───────────────────────────────────────────────────────────
    {
      slug: "mini-bt-speaker",
      name: "MiniBeat Bluetooth Speaker",
      brand: "SoundWave",
      description:
        "Compact portable Bluetooth speaker with 12W output, 10-hour battery and IPX6 waterproof rating. Pairs two for stereo.",
      price: 1999,
      categoryId: catMap["Speakers"]!,
      merchantId: merchantA.id,
      tags: ["bluetooth-speaker", "portable", "waterproof", "ipx6", "outdoor", "compact"],
      specifications: { power: "12W", battery: "10 hours", connectivity: "Bluetooth 5.0", waterResistance: "IPX6", weight: "300g" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 90,
    },
    {
      slug: "home-bookshelf-speakers",
      name: "StudioShelf Passive Bookshelf Speakers (Pair)",
      brand: "AudioMax",
      description:
        "Pair of 2-way passive bookshelf speakers with 6.5-inch woofer and 1-inch tweeter. 80W RMS. For use with an amplifier or AV receiver.",
      price: 7999,
      categoryId: catMap["Speakers"]!,
      merchantId: merchantB.id,
      tags: ["speakers", "bookshelf", "passive", "hi-fi", "home-audio", "pair"],
      specifications: { power: "80W RMS", woofer: "6.5-inch", tweeter: "1-inch silk dome", impedance: "6Ω", frequency: "50Hz-20kHz" },
      deliveryInfo: "Ships in 3-5 business days.",
      returnPolicy: RETURN_14,
      stock: 20,
    },
    {
      slug: "bt-soundbar-speaker",
      name: "SoundBar 40W Bluetooth Speaker",
      brand: "SoundWave",
      description:
        "40W soundbar-style portable Bluetooth speaker with dual passive radiators for deep bass, 15-hour battery and TWS pairing.",
      price: 2999,
      categoryId: catMap["Speakers"]!,
      merchantId: merchantA.id,
      tags: ["bluetooth-speaker", "soundbar", "bass", "portable", "tws", "15-hour"],
      specifications: { power: "40W", battery: "15 hours", connectivity: "Bluetooth 5.1", weight: "850g" },
      deliveryInfo: DELIVERY,
      returnPolicy: RETURN_7,
      stock: 55,
    },
  ];

  let created = 0;
  let updated = 0;

  for (const p of products) {
    const existed = await prisma.product.findFirst({
      where: { merchantId: p.merchantId, slug: p.slug },
      select: { id: true },
    });
    await upsertProduct(p);
    if (existed) updated++;
    else created++;
    process.stdout.write(".");
  }

  console.log(`\n  ✓ ${created} products created, ${updated} updated\n`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = await prisma.product.count({ where: { isActive: true } });
  const totalCats = await prisma.category.count();
  console.log("Seed complete.");
  console.log(`  Active products  : ${total}`);
  console.log(`  Categories       : ${totalCats}`);
  console.log(`  Merchants seeded : 2 (demo-merchant@intentflow.dev, demo-merchant-b@intentflow.dev)`);
  console.log(`\nCredentials for demo merchants:`);
  console.log(`  Email   : demo-merchant@intentflow.dev`);
  console.log(`  Password: IntentFlow2025!`);
  console.log(`\nNext step: generate embeddings with:`);
  console.log(`  node --env-file=.env dist/apps/api/src/scripts/indexEmbeddings.js`);
  console.log(`  (Requires GEMINI_API_KEY in .env)\n`);
}

main()
  .catch((err) => {
    console.error("\n[SEED ERROR]", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
