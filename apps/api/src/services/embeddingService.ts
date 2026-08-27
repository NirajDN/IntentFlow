import crypto from "crypto";
import prisma from "@intentflow/database";
import {
  OpenAIEmbeddingProvider,
  buildProductEmbeddingText,
  type EmbeddingProvider,
  type ProductSemanticInput,
} from "@intentflow/ai";
import logger from "../lib/logger.js";

export interface IndexResult {
  status: "indexed" | "skipped" | "failed";
  productId: string;
  contentHash?: string;
  reason?: string;
  error?: string;
}

export interface BatchIndexResult {
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
  errors: Array<{ productId: string; error: string }>;
}

let defaultProvider: EmbeddingProvider | null = null;

export function getDefaultEmbeddingProvider(): EmbeddingProvider {
  if (!defaultProvider) {
    defaultProvider = new OpenAIEmbeddingProvider();
  }
  return defaultProvider;
}

export function setDefaultEmbeddingProvider(provider: EmbeddingProvider | null) {
  defaultProvider = provider;
}

/**
 * Computes deterministic SHA-256 hash of product's semantic text representation.
 */
export function computeProductContentHash(product: ProductSemanticInput): string {
  const text = buildProductEmbeddingText(product);
  return crypto.createHash("sha256").update(text).digest("hex");
}

export interface IndexProductOptions {
  provider?: EmbeddingProvider;
  force?: boolean;
}

/**
 * Indexes a single product:
 * Computes content hash -> checks existing embedding -> generates vector if missing/changed -> upserts record.
 */
export async function indexProduct(
  productOrId: string | (ProductSemanticInput & { id: string; embedding?: { contentHash: string } | null }),
  options: IndexProductOptions = {}
): Promise<IndexResult> {
  const provider = options.provider ?? getDefaultEmbeddingProvider();

  let product: (ProductSemanticInput & { id: string; embedding?: { contentHash: string } | null });

  if (typeof productOrId === "string") {
    const fetched = await prisma.product.findUnique({
      where: { id: productOrId },
      include: {
        category: true,
        embedding: {
          select: {
            id: true,
            contentHash: true,
          },
        },
      },
    });

    if (!fetched) {
      return {
        status: "failed",
        productId: productOrId,
        error: "Product not found",
      };
    }
    product = fetched as unknown as (ProductSemanticInput & { id: string; embedding?: { contentHash: string } | null });
  } else {
    product = productOrId;
  }

  const contentHash = computeProductContentHash(product);

  // Check if embedding already exists and is unchanged
  if (!options.force) {
    let existingHash = product.embedding?.contentHash;
    if (!existingHash) {
      const existingRecord = await prisma.productEmbedding.findUnique({
        where: { productId: product.id },
        select: { contentHash: true },
      });
      existingHash = existingRecord?.contentHash;
    }

    if (existingHash === contentHash) {
      return {
        status: "skipped",
        productId: product.id,
        contentHash,
        reason: "unchanged",
      };
    }
  }

  try {
    const semanticText = buildProductEmbeddingText(product);
    const vector = await provider.embedText(semanticText);

    if (!Array.isArray(vector) || vector.length !== 1536) {
      throw new Error(`Invalid embedding vector returned. Expected 1536 dimensions, got ${vector?.length}`);
    }

    const id = `emb_${crypto.randomUUID().replace(/-/g, "")}`;
    const vectorString = `[${vector.join(",")}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "product_embeddings" ("id", "productId", "embedding", "model", "contentHash", "createdAt", "updatedAt")
       VALUES ($1, $2, $3::vector, $4, $5, NOW(), NOW())
       ON CONFLICT ("productId")
       DO UPDATE SET
         "embedding" = EXCLUDED."embedding",
         "model" = EXCLUDED."model",
         "contentHash" = EXCLUDED."contentHash",
         "updatedAt" = NOW()`,
      id,
      product.id,
      vectorString,
      provider.model,
      contentHash
    );

    logger.info({ productId: product.id, contentHash }, "Product embedding synchronized");

    return {
      status: "indexed",
      productId: product.id,
      contentHash,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to generate product embedding";
    logger.warn({ productId: product.id, error: errorMsg }, "Product embedding generation failed (non-fatal)");

    return {
      status: "failed",
      productId: product.id,
      contentHash,
      error: errorMsg,
    };
  }
}

/**
 * Synchronizes embeddings for all active products in catalog.
 */
export async function indexAllProducts(
  options: IndexProductOptions = {}
): Promise<BatchIndexResult> {
  const provider = options.provider ?? getDefaultEmbeddingProvider();

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      category: true,
      embedding: {
        select: {
          id: true,
          contentHash: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result: BatchIndexResult = {
    total: products.length,
    indexed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const product of products) {
    const itemResult = await indexProduct(product as unknown as (ProductSemanticInput & { id: string; embedding?: { contentHash: string } | null }), { provider, force: options.force });

    if (itemResult.status === "indexed") {
      result.indexed++;
    } else if (itemResult.status === "skipped") {
      result.skipped++;
    } else if (itemResult.status === "failed") {
      result.failed++;
      result.errors.push({
        productId: product.id,
        error: itemResult.error || "Unknown indexing error",
      });
    }
  }

  logger.info(
    { total: result.total, indexed: result.indexed, skipped: result.skipped, failed: result.failed },
    "Bulk product embedding synchronization finished"
  );

  return result;
}
