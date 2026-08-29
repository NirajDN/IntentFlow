import { Router, Request, Response } from "express";
import { apiError, apiSuccess } from "@intentflow/shared";
import { GeminiIntentParser } from "@intentflow/ai";
import { searchProducts } from "../services/searchService.js";

const router = Router();

/**
 * GET /api/search/products
 *
 * Direct structured search endpoint.
 *
 * Example:
 * /api/search/products?q=headphones&maxPrice=5000
 */
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
      minPrice:
        minPrice !== undefined ? Number(minPrice) : undefined,
      maxPrice:
        maxPrice !== undefined ? Number(maxPrice) : undefined,
      activeOnly: activeOnly === "false" ? false : true,
      inStockOnly: inStockOnly === "true",
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    res.status(200).json(apiSuccess(result));
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Search failed";

    const status = message.startsWith(
      "Invalid search parameters"
    )
      ? 400
      : 500;

    res.status(status).json(apiError(message));
  }
});

/**
 * POST /api/search/intent
 *
 * Natural-language shopping search.
 *
 * Example body:
 * {
 *   "message": "Show me wireless headphones under 5000"
 * }
 *
 * Flow:
 * User message
 *      ↓
 * GeminiIntentParser
 *      ↓
 * Structured shopping intent
 *      ↓
 * Existing searchProducts()
 *      ↓
 * Semantic + deterministic ranking
 */
router.post("/intent", async (req: Request, res: Response) => {
  const { message } = req.body as {
    message?: unknown;
  };

  if (typeof message !== "string" || !message.trim()) {
    res
      .status(400)
      .json(apiError("message must be a non-empty string"));

    return;
  }

  try {
    const intentParser = new GeminiIntentParser();

    const intent = await intentParser.parseIntent(message);

    const result = await searchProducts({
      query: intent.query,
      category: intent.category,
      minPrice: intent.minPrice,
      maxPrice: intent.maxPrice,
      inStockOnly: intent.inStockOnly,
      ram: intent.ram,
      page: 1,
      limit: 20,
    });

    res.status(200).json(
      apiSuccess({
        intent,
        results: result,
      })
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Natural-language search failed";

    res.status(500).json(apiError(message));
  }
});

export default router;