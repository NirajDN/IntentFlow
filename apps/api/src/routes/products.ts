import { Router, Request, Response } from "express";
import { apiError, apiSuccess, CsvImportResult, CsvRowError } from "@intentflow/shared";
import prisma from "@intentflow/database";
import { authenticateUser, requireRole, AuthenticatedRequest } from "../middleware/auth.js";
import type { Prisma } from "@prisma/client";

const router = Router();

// Helper to parse simple CSV text
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse header line handling quoted values
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const rawHeaders = parseLine(lines[0] || "");
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawRow = parseLine(lines[i] || "");
    const rowObj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = rawRow[idx] !== undefined ? rawRow[idx] : "";
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

// ─── GET /api/products ────────────────────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const {
    categoryId,
    categorySlug,
    category,
    merchantId,
    isActive,
    search,
    brand,
    page = "1",
    limit = "20",
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const where: Prisma.ProductWhereInput = {};

  if (merchantId) {
    where.merchantId = merchantId;
  }

  if (categoryId) {
    where.categoryId = categoryId;
  } else if (categorySlug || category) {
    where.category = {
      slug: (categorySlug || category)!.toLowerCase(),
    };
  }

  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  if (brand) {
    where.brand = { contains: brand, mode: "insensitive" };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { brand: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const [total, items] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy === "price" ? "price" : "createdAt"]: sortOrder === "asc" ? "asc" : "desc",
        },
        include: {
          category: true,
          inventory: true,
          variants: true,
        },
      }),
    ]);

    res.status(200).json(
      apiSuccess({
        items,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch products";
    res.status(500).json(apiError(message));
  }
});

// ─── POST /api/products/import (CSV Import) ───────────────────
router.post(
  "/import",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const merchant = await prisma.merchant.findFirst({
      where: { ownerId: req.user!.id },
    });

    if (!merchant) {
      res.status(400).json(apiError("Merchant profile required to import products"));
      return;
    }

    let csvText = "";
    if (typeof req.body === "string") {
      csvText = req.body;
    } else if (req.body && typeof req.body.csvContent === "string") {
      csvText = req.body.csvContent;
    } else if (req.body && typeof req.body.csv === "string") {
      csvText = req.body.csv;
    }

    if (!csvText || csvText.trim().length === 0) {
      res.status(400).json(apiError("CSV content is empty or missing"));
      return;
    }

    const { rows } = parseCsv(csvText);
    if (rows.length === 0) {
      res.status(400).json(apiError("No data rows found in CSV"));
      return;
    }

    const errors: CsvRowError[] = [];
    const validRows: Array<{
      name: string;
      slug: string;
      description?: string;
      brand?: string;
      categoryName?: string;
      price: number;
      currency: string;
      sku?: string;
      stock: number;
    }> = [];

    const existingSkusInDb = new Set(
      (await prisma.productVariant.findMany({ select: { sku: true } })).map((v) => v.sku)
    );
    const seenSkusInBatch = new Set<string>();

    rows.forEach((row, index) => {
      const rowNum = index + 1;
      const name = (row["name"] || "").trim();
      const priceStr = row["price"] || "";
      const price = parseFloat(priceStr);
      const stockStr = row["stock"] || "0";
      const stock = parseInt(stockStr, 10);
      const sku = (row["sku"] || "").trim();

      if (!name) {
        errors.push({ row: rowNum, error: "Product name is required", data: row });
        return;
      }

      if (isNaN(price) || price < 0) {
        errors.push({ row: rowNum, error: "Price must be a valid non-negative number", data: row });
        return;
      }

      if (isNaN(stock) || stock < 0) {
        errors.push({ row: rowNum, error: "Stock must be a non-negative integer", data: row });
        return;
      }

      if (sku) {
        if (existingSkusInDb.has(sku) || seenSkusInBatch.has(sku)) {
          errors.push({ row: rowNum, error: `Duplicate SKU: ${sku}`, data: row });
          return;
        }
        seenSkusInBatch.add(sku);
      }

      const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const uniqueSlug = `${slugBase}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

      validRows.push({
        name,
        slug: uniqueSlug,
        description: row["description"]?.trim() || undefined,
        brand: row["brand"]?.trim() || undefined,
        categoryName: row["category"]?.trim() || undefined,
        price,
        currency: (row["currency"] || "INR").trim().toUpperCase(),
        sku: sku || undefined,
        stock,
      });
    });

    if (errors.length > 0 && validRows.length === 0) {
      const result: CsvImportResult = {
        total: rows.length,
        imported: 0,
        failed: errors.length,
        errors,
      };
      res.status(400).json(apiSuccess(result));
      return;
    }

    // Execute database creations in a transaction
    try {
      await prisma.$transaction(async (tx) => {
        for (const item of validRows) {
          let categoryId: string | undefined = undefined;
          if (item.categoryName) {
            const catSlug = item.categoryName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const cat = await tx.category.upsert({
              where: { slug: catSlug },
              create: { name: item.categoryName, slug: catSlug },
              update: {},
            });
            categoryId = cat.id;
          }

          const product = await tx.product.create({
            data: {
              merchantId: merchant.id,
              categoryId,
              name: item.name,
              slug: item.slug,
              description: item.description,
              brand: item.brand,
              price: item.price,
              currency: item.currency,
              isActive: true,
              inventory: {
                create: {
                  availableQuantity: item.stock,
                  reservedQuantity: 0,
                  soldQuantity: 0,
                  adjustments: item.stock > 0 ? {
                    create: {
                      quantityChange: item.stock,
                      reason: "Initial CSV Import Stock",
                    },
                  } : undefined,
                },
              },
              variants: item.sku ? {
                create: {
                  name: item.name,
                  sku: item.sku,
                  price: item.price,
                  isActive: true,
                },
              } : undefined,
            },
          });
        }
      });

      const result: CsvImportResult = {
        total: rows.length,
        imported: validRows.length,
        failed: errors.length,
        errors,
      };

      res.status(200).json(apiSuccess(result));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to import CSV products";
      res.status(500).json(apiError(message));
    }
  }
);

// ─── POST /api/products ───────────────────────────────────────
router.post(
  "/",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const merchant = await prisma.merchant.findFirst({
      where: { ownerId: req.user!.id },
    });

    if (!merchant) {
      res.status(400).json(apiError("Merchant profile required to create products"));
      return;
    }

    const {
      name,
      slug,
      categoryId,
      categoryName,
      description,
      brand,
      price,
      currency = "INR",
      specifications = {},
      tags = [],
      imageUrl,
      deliveryInfo,
      returnPolicy,
      isActive = true,
      initialStock = 0,
      sku,
      variants = [],
    } = req.body as {
      name?: string;
      slug?: string;
      categoryId?: string;
      categoryName?: string;
      description?: string;
      brand?: string;
      price?: number;
      currency?: string;
      specifications?: Record<string, unknown>;
      tags?: string[];
      imageUrl?: string;
      deliveryInfo?: string;
      returnPolicy?: string;
      isActive?: boolean;
      initialStock?: number;
      sku?: string;
      variants?: Array<{
        name: string;
        sku: string;
        price: number;
        specifications?: Record<string, unknown>;
        isActive?: boolean;
      }>;
    };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json(apiError("Product name is required"));
      return;
    }

    if (price === undefined || typeof price !== "number" || isNaN(price) || price < 0) {
      res.status(400).json(apiError("Product price must be a non-negative number"));
      return;
    }

    if (initialStock < 0) {
      res.status(400).json(apiError("Initial stock cannot be negative"));
      return;
    }

    const generatedSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    try {
      // Check duplicate slug for this merchant
      const existingProduct = await prisma.product.findUnique({
        where: {
          merchantId_slug: {
            merchantId: merchant.id,
            slug: generatedSlug,
          },
        },
      });

      if (existingProduct) {
        res.status(409).json(apiError("A product with this slug already exists for this merchant"));
        return;
      }

      // Check duplicate SKU if provided
      if (sku) {
        const existingSku = await prisma.productVariant.findUnique({
          where: { sku: sku.trim() },
        });
        if (existingSku) {
          res.status(409).json(apiError(`SKU '${sku}' already exists`));
          return;
        }
      }

      // Check variant SKUs
      for (const v of variants) {
        if (!v.sku || typeof v.sku !== "string") {
          res.status(400).json(apiError("Variant SKU is required"));
          return;
        }
        if (typeof v.price !== "number" || v.price < 0) {
          res.status(400).json(apiError("Variant price must be non-negative"));
          return;
        }
        const existingSku = await prisma.productVariant.findUnique({
          where: { sku: v.sku.trim() },
        });
        if (existingSku) {
          res.status(409).json(apiError(`Variant SKU '${v.sku}' already exists`));
          return;
        }
      }

      // Handle category creation if categoryName is given and no categoryId
      let resolvedCategoryId = categoryId;
      if (!resolvedCategoryId && categoryName) {
        const catSlug = categoryName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
        const category = await prisma.category.upsert({
          where: { slug: catSlug },
          create: { name: categoryName.trim(), slug: catSlug },
          update: {},
        });
        resolvedCategoryId = category.id;
      }

      const variantCreateData = [...variants];
      if (sku && !variants.some((v) => v.sku === sku)) {
        variantCreateData.push({
          name: `${name} (Default)`,
          sku: sku.trim(),
          price,
          specifications: {},
          isActive: true,
        });
      }

      const product = await prisma.product.create({
        data: {
          merchantId: merchant.id,
          categoryId: resolvedCategoryId || null,
          name: name.trim(),
          slug: generatedSlug,
          description: description?.trim() || null,
          brand: brand?.trim() || null,
          price,
          currency: (currency || "INR").trim().toUpperCase(),
          specifications: (specifications as Prisma.InputJsonValue) || {},
          tags: Array.isArray(tags) ? tags : [],
          imageUrl: imageUrl?.trim() || null,
          deliveryInfo: deliveryInfo?.trim() || null,
          returnPolicy: returnPolicy?.trim() || null,
          isActive,
          inventory: {
            create: {
              availableQuantity: initialStock,
              reservedQuantity: 0,
              soldQuantity: 0,
              adjustments: initialStock > 0 ? {
                create: {
                  quantityChange: initialStock,
                  reason: "Initial Product Stock Creation",
                },
              } : undefined,
            },
          },
          variants: variantCreateData.length > 0 ? {
            create: variantCreateData.map((v) => ({
              name: v.name.trim(),
              sku: v.sku.trim(),
              price: v.price,
              specifications: (v.specifications as Prisma.InputJsonValue) || {},
              isActive: v.isActive !== undefined ? v.isActive : true,
            })),
          } : undefined,
        },
        include: {
          category: true,
          inventory: true,
          variants: true,
        },
      });

      res.status(201).json(apiSuccess(product));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create product";
      res.status(500).json(apiError(message));
    }
  }
);

// ─── GET /api/products/:id ────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        inventory: {
          include: {
            adjustments: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        },
        variants: true,
        merchant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!product) {
      res.status(404).json(apiError("Product not found"));
      return;
    }

    res.status(200).json(apiSuccess(product));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch product";
    res.status(500).json(apiError(message));
  }
});

// ─── PATCH /api/products/:id ──────────────────────────────────
router.patch(
  "/:id",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id as string;
    const {
      name,
      slug,
      categoryId,
      description,
      brand,
      price,
      currency,
      specifications,
      tags,
      imageUrl,
      deliveryInfo,
      returnPolicy,
      isActive,
    } = req.body as {
      name?: string;
      slug?: string;
      categoryId?: string | null;
      description?: string | null;
      brand?: string | null;
      price?: number;
      currency?: string;
      specifications?: Record<string, unknown>;
      tags?: string[];
      imageUrl?: string | null;
      deliveryInfo?: string | null;
      returnPolicy?: string | null;
      isActive?: boolean;
    };

    if (price !== undefined && (typeof price !== "number" || isNaN(price) || price < 0)) {
      res.status(400).json(apiError("Price must be a non-negative number"));
      return;
    }

    try {
      const merchant = await prisma.merchant.findFirst({
        where: { ownerId: req.user!.id },
      });

      if (!merchant) {
        res.status(403).json(apiError("Merchant profile required"));
        return;
      }

      const existing = await prisma.product.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json(apiError("Product not found"));
        return;
      }

      if (existing.merchantId !== merchant.id) {
        res.status(403).json(apiError("You are not authorized to modify another merchant's product"));
        return;
      }

      const updated = await prisma.product.update({
        where: { id },
        data: {
          ...(name && typeof name === "string" ? { name: name.trim() } : {}),
          ...(slug && typeof slug === "string" ? { slug: slug.trim().toLowerCase() } : {}),
          ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
          ...(brand !== undefined ? { brand: brand?.trim() || null } : {}),
          ...(typeof price === "number" ? { price } : {}),
          ...(currency && typeof currency === "string" ? { currency: currency.trim().toUpperCase() } : {}),
          ...(specifications !== undefined ? { specifications: (specifications as Prisma.InputJsonValue) } : {}),
          ...(Array.isArray(tags) ? { tags } : {}),
          ...(imageUrl !== undefined ? { imageUrl: imageUrl?.trim() || null } : {}),
          ...(deliveryInfo !== undefined ? { deliveryInfo: deliveryInfo?.trim() || null } : {}),
          ...(returnPolicy !== undefined ? { returnPolicy: returnPolicy?.trim() || null } : {}),
          ...(typeof isActive === "boolean" ? { isActive } : {}),
        },
        include: {
          category: true,
          inventory: true,
          variants: true,
        },
      });

      res.status(200).json(apiSuccess(updated));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update product";
      res.status(500).json(apiError(message));
    }
  }
);

// ─── DELETE /api/products/:id ─────────────────────────────────
router.delete(
  "/:id",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = req.params.id as string;

    try {
      const merchant = await prisma.merchant.findFirst({
        where: { ownerId: req.user!.id },
      });

      if (!merchant) {
        res.status(403).json(apiError("Merchant profile required"));
        return;
      }

      const existing = await prisma.product.findUnique({
        where: { id },
      });

      if (!existing) {
        res.status(404).json(apiError("Product not found"));
        return;
      }

      if (existing.merchantId !== merchant.id) {
        res.status(403).json(apiError("You are not authorized to delete another merchant's product"));
        return;
      }

      // Soft delete by deactivating or hard delete if no orders exist yet
      const deactivated = await prisma.product.update({
        where: { id },
        data: { isActive: false },
      });

      res.status(200).json(apiSuccess({ id: deactivated.id, isActive: deactivated.isActive, message: "Product deactivated successfully" }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete product";
      res.status(500).json(apiError(message));
    }
  }
);

export default router;
