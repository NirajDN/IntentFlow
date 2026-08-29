import prisma from "@intentflow/database";
import { getDefaultEmbeddingProvider, type IndexProductOptions } from "./embeddingService.js";
import type { EmbeddingProvider } from "@intentflow/ai";
import logger from "../lib/logger.js";

// ─── Search Parameters ────────────────────────────────────────────────────────

export interface SearchProductsParams {
  query?: string;
  categoryId?: string;
  category?: string;         // slug or name
  merchantId?: string;
  minPrice?: number;
  maxPrice?: number;
  ram?: number;
  activeOnly?: boolean;      // default true
  inStockOnly?: boolean;     // default false
  page?: number;             // >= 1
  limit?: number;            // 1..100
  provider?: EmbeddingProvider;
}

// ─── Search Result ────────────────────────────────────────────────────────────

export interface ProductSearchResult {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    brand: string | null;
    price: number;
    currency: string;
    tags: string[];
    imageUrl: string | null;
    deliveryInfo: string | null;
    returnPolicy: string | null;
    isActive: boolean;
    merchantId: string;
    categoryId: string | null;
    category: { id: string; name: string; slug: string } | null;
    inventory: {
      availableQuantity: number;
      reservedQuantity: number;
      soldQuantity: number;
    } | null;
  };
  relevanceScore: number;   // 0..1 composite final score
  semanticScore: number;    // 0..1 cosine similarity
  matchedReasons: string[];
}

export interface SearchProductsResponse {
  items: ProductSearchResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  query: string;
  semanticEnabled: boolean;
}

// ─── Internal candidate type ──────────────────────────────────────────────────

interface CandidateProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  price: number;
  currency: string;
  tags: string[];
  imageUrl: string | null;
  deliveryInfo: string | null;
  returnPolicy: string | null;
  isActive: boolean;
  merchantId: string;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  inventory: {
    availableQuantity: number;
    reservedQuantity: number;
    soldQuantity: number;
  } | null;
}

interface VectorMatch {
  productId: string;
  cosineSimilarity: number;
}

// ─── Ranking weights (documented) ─────────────────────────────────────────────
// finalScore = semanticScore * 0.75 + constraintScore * 0.15 + priceFitScore * 0.10
// semanticScore  : cosine similarity from pgvector (0..1), 0 when no embedding
// constraintScore: deterministic boolean flag scoring (category+merchant match)
// priceFitScore  : 1.0 when price is inside [minPrice, maxPrice], linear otherwise
const WEIGHT_SEMANTIC = 0.60;
const WEIGHT_CONSTRAINT = 0.20;
const WEIGHT_PRICE_FIT = 0.20;

// ─── Parameter validation ─────────────────────────────────────────────────────

export function validateSearchParams(raw: SearchProductsParams): {
  valid: boolean;
  errors: string[];
 normalized: SearchProductsParams & {
  page: number;
  limit: number;
  activeOnly: boolean;
  inStockOnly: boolean;
  minPrice?: number;
  maxPrice?: number;
};
} {
  const errors: string[] = [];

  const page = raw.page === undefined ? 1 : Math.max(1, Math.floor(Number(raw.page)));
  const limit = raw.limit === undefined ? 20 : Math.min(100, Math.max(1, Math.floor(Number(raw.limit))));

  if (raw.minPrice !== undefined && (isNaN(Number(raw.minPrice)) || Number(raw.minPrice) < 0)) {
    errors.push("minPrice must be a non-negative number");
  }
  if (raw.maxPrice !== undefined && (isNaN(Number(raw.maxPrice)) || Number(raw.maxPrice) < 0)) {
    errors.push("maxPrice must be a non-negative number");
  }
  if (
    raw.minPrice !== undefined &&
    raw.maxPrice !== undefined &&
    Number(raw.minPrice) > Number(raw.maxPrice)
  ) {
    errors.push("minPrice cannot be greater than maxPrice");
  }

  const normalized = {
    ...raw,
    page,
    limit,
    activeOnly: raw.activeOnly !== false, // default true
    inStockOnly: raw.inStockOnly === true,  // default false
    minPrice: raw.minPrice !== undefined ? Number(raw.minPrice) : undefined,
    maxPrice: raw.maxPrice !== undefined ? Number(raw.maxPrice) : undefined,
  };

  return { valid: errors.length === 0, errors, normalized };
}

// ─── Deterministic price fit score ───────────────────────────────────────────
function computePriceFitScore(
  price: number,
  minPrice?: number,
  maxPrice?: number
): number {
  if (minPrice === undefined && maxPrice === undefined) return 1.0;
  const aboveMin = minPrice === undefined || price >= minPrice;
  const belowMax = maxPrice === undefined || price <= maxPrice;
  if (aboveMin && belowMax) return 1.0;
  // Partial score based on distance from range
  if (!aboveMin && minPrice !== undefined) {
    const deviation = (minPrice - price) / minPrice;
    return Math.max(0, 1 - deviation);
  }
  if (!belowMax && maxPrice !== undefined) {
    const deviation = (price - maxPrice) / maxPrice;
    return Math.max(0, 1 - deviation);
  }
  return 0;
}

// ─── Main Search Function ─────────────────────────────────────────────────────

export async function searchProducts(
  params: SearchProductsParams
): Promise<SearchProductsResponse> {
  const { valid, errors, normalized } = validateSearchParams(params);
  if (!valid) {
    throw new Error(`Invalid search parameters: ${errors.join("; ")}`);
  }

  const {
    query,
    categoryId,
    category: categoryFilter,
    merchantId,
    minPrice,
    maxPrice,
    ram,
    activeOnly,
    inStockOnly,
    page,
    limit,
    provider: providerOverride,
  } = normalized;

  const provider = providerOverride ?? getDefaultEmbeddingProvider();

  // ── Step 1: Resolve category ID from slug/name if needed ─────────────────
  let resolvedCategoryId = categoryId;
  if (!resolvedCategoryId && categoryFilter) {
  // Prefer exact slug match first.
  const bySlug = await prisma.category.findFirst({
    where: {
      slug: categoryFilter.toLowerCase().trim(),
    },
    select: { id: true },
  });

  if (bySlug) {
    resolvedCategoryId = bySlug.id;
  } else {
    // Fall back to name match.
    // If duplicate category names exist, prefer the category
    // that is currently referenced by active products.
    const categories = await prisma.category.findMany({
      where: {
        name: {
          equals: categoryFilter.trim(),
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

   if (categories.length === 1) {
  const onlyCategory = categories[0];

  if (onlyCategory) {
    resolvedCategoryId = onlyCategory.id;
  }
} else if (categories.length > 1) {
      const categoryIds = categories.map((category) => category.id);

      const activeProduct = await prisma.product.findFirst({
        where: {
          categoryId: { in: categoryIds },
          isActive: true,
        },
        select: {
          categoryId: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (activeProduct?.categoryId) {
        resolvedCategoryId = activeProduct.categoryId;
      }
    }
  }
}

  // ── Step 2: Build WHERE clause for authoritative hard filters ────────────
  const where: Record<string, unknown> = {};

  if (activeOnly) where["isActive"] = true;

  if (resolvedCategoryId) where["categoryId"] = resolvedCategoryId;

  if (merchantId) where["merchantId"] = merchantId;

  if (minPrice !== undefined || maxPrice !== undefined) {
    where["price"] = {
      ...(minPrice !== undefined ? { gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
    };
  }

  if (inStockOnly) {
  where["inventory"] = { availableQuantity: { gt: 0 } };
}

if (ram !== undefined) {
  where["specifications"] = {
    path: ["ram"],
    equals: ram,
  };
}

  // ── Step 3: Embed query for semantic search ──────────────────────────────
  let vectorMatches: Map<string, number> = new Map();
  let semanticEnabled = false;

  if (query && query.trim()) {
    try {
      const vector = await provider.embedText(query.trim());
      const vectorString = `[${vector.join(",")}]`;

      // Cosine similarity: 1 - cosine_distance. pgvector returns l2/cosine distance
      // Using <=> cosine distance operator: similarity = 1 - distance
      const rawMatches = await prisma.$queryRawUnsafe<
        Array<{ product_id: string; distance: number }>
      >(
        `SELECT pe."productId" as product_id,
                (pe.embedding <=> $1::vector) as distance
         FROM product_embeddings pe
         ORDER BY distance ASC
         LIMIT 200`,
        vectorString
      );

      for (const m of rawMatches) {
        // cosine_similarity = 1 - cosine_distance, clamped to [0,1]
        const similarity = Math.max(0, Math.min(1, 1 - m.distance));
        vectorMatches.set(m.product_id, similarity);
      }
      semanticEnabled = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // Graceful fallback: proceed with deterministic catalog search only
      logger.warn({ error: msg }, "Embedding query failed; falling back to keyword search");
      semanticEnabled = false;
    }
  }

  // ── Step 4: Fetch candidate products (hard-filtered by DB) ───────────────
  // When semantic is enabled: fetch only products that have embeddings OR all products in range
  // We fetch all hard-filtered products then re-rank.

  const candidates = await prisma.product.findMany({
    where,
    include: {
      category: {
        select: { id: true, name: true, slug: true },
      },
      inventory: {
        select: {
          availableQuantity: true,
          reservedQuantity: true,
          soldQuantity: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500, // fetch enough candidates for ranking, pagination done after
  }) as unknown as CandidateProduct[];

  // ── Step 5: Deterministic ranking ────────────────────────────────────────
  const ranked: Array<ProductSearchResult & { _finalScore: number }> = [];
  for (const product of candidates) {
    // Semantic score: 0 for products without embeddings when semantic is enabled
    const semanticScore = semanticEnabled
      ? (vectorMatches.get(product.id) ?? 0)
      : 0;

    // If semantic search is enabled and this product has no embedding, still include it
    // with semanticScore=0 — it may still pass hard filters and appear for catalog browsing.

    // Constraint score: full credit for matching category/merchant (optional boost)
    let constraintScore = 0.5; // neutral baseline
    if (resolvedCategoryId && product.categoryId === resolvedCategoryId) {
      constraintScore += 0.3;
    }
    if (merchantId && product.merchantId === merchantId) {
      constraintScore += 0.2;
    }
    constraintScore = Math.min(1, constraintScore);

    // Price fit score
    const priceFitScore = computePriceFitScore(product.price, minPrice, maxPrice);

    // Final weighted composite score
    const _finalScore =
      semanticScore * WEIGHT_SEMANTIC +
      constraintScore * WEIGHT_CONSTRAINT +
      priceFitScore * WEIGHT_PRICE_FIT;

    // Build matched reasons (deterministic)
    const matchedReasons: string[] = [];
    if (semanticEnabled && semanticScore >= 0.7) {
      matchedReasons.push("Strong semantic match");
    } else if (semanticEnabled && semanticScore >= 0.4) {
      matchedReasons.push("Relevant semantic match");
    } else if (semanticEnabled && semanticScore > 0) {
      matchedReasons.push("Partial semantic match");
    }
    if (!semanticEnabled && query) {
      matchedReasons.push("Keyword catalog match");
    }
    if (resolvedCategoryId && product.categoryId === resolvedCategoryId) {
      matchedReasons.push("Matches selected category");
    }
    if (minPrice !== undefined && product.price >= minPrice) {
      matchedReasons.push("Within minimum price");
    }
    if (maxPrice !== undefined && product.price <= maxPrice) {
      matchedReasons.push("Within maximum price");
    }
    if (
      product.inventory &&
      product.inventory.availableQuantity > 0
    ) {
      matchedReasons.push("Currently in stock");
    }

    ranked.push({
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        brand: product.brand,
        price: product.price,
        currency: product.currency,
        tags: product.tags,
        imageUrl: product.imageUrl,
        deliveryInfo: product.deliveryInfo,
        returnPolicy: product.returnPolicy,
        isActive: product.isActive,
        merchantId: product.merchantId,
        categoryId: product.categoryId,
        category: product.category,
        inventory: product.inventory,
      },
      relevanceScore: Math.round(_finalScore * 1000) / 1000,
      semanticScore: Math.round(semanticScore * 1000) / 1000,
      matchedReasons,
      _finalScore,
    });
  }

  // Sort by final score descending (deterministic: tie-break by product id)
  ranked.sort((a, b) =>
    b._finalScore !== a._finalScore
      ? b._finalScore - a._finalScore
      : a.product.id.localeCompare(b.product.id)
  );

  // ── Step 6: Paginate ──────────────────────────────────────────────────────
  const total = ranked.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const pageItems = ranked.slice(offset, offset + limit).map(({ _finalScore, ...rest }) => rest);

  return {
    items: pageItems,
    total,
    page: safePage,
    limit,
    totalPages,
    query: query?.trim() ?? "",
    semanticEnabled,
  };
}








