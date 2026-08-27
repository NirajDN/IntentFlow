import { Router, Request, Response } from "express";
import { apiError, apiSuccess } from "@intentflow/shared";
import { searchProducts } from "../services/searchService.js";

const router = Router();

// ─── GET /api/search/products ─────────────────────────────────────────────────
router.get("/products", async (req: Request, res: Response) => {
  const {
    q,
    categoryId,
    category,
    merchantId,
    minPrice,
    maxPrice,
    activeOnly,
    inStockOnly,
    page,
    limit,
  } = req.query as Record<string, string | undefined>;

  try {
    const result = await searchProducts({
      query: q,
      categoryId,
      category,
      merchantId,
      minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
      maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
      activeOnly: activeOnly === "false" ? false : true,
      inStockOnly: inStockOnly === "true",
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    res.status(200).json(apiSuccess(result));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Search failed";
    const status = message.startsWith("Invalid search parameters") ? 400 : 500;
    res.status(status).json(apiError(message));
  }
});

export default router;
