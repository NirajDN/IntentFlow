import { Router, Response } from "express";
import { apiError, apiSuccess } from "@intentflow/shared";
import prisma from "@intentflow/database";
import { authenticateUser, requireRole, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

// ─── GET /api/inventory ───────────────────────────────────────
router.get(
  "/",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const merchant = await prisma.merchant.findFirst({
        where: { ownerId: req.user!.id },
      });

      if (!merchant) {
        res.status(400).json(apiError("Merchant profile required"));
        return;
      }

      const inventories = await prisma.inventory.findMany({
        where: {
          product: {
            merchantId: merchant.id,
          },
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              brand: true,
              price: true,
              currency: true,
              isActive: true,
            },
          },
          adjustments: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      res.status(200).json(apiSuccess(inventories));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch inventories";
      res.status(500).json(apiError(message));
    }
  }
);

// ─── GET /api/inventory/:productId ────────────────────────────
router.get(
  "/:productId",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const productId = req.params.productId as string;

    try {
      const merchant = await prisma.merchant.findFirst({
        where: { ownerId: req.user!.id },
      });

      if (!merchant) {
        res.status(400).json(apiError("Merchant profile required"));
        return;
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        res.status(404).json(apiError("Product not found"));
        return;
      }

      if (product.merchantId !== merchant.id) {
        res.status(403).json(apiError("You are not authorized to view another merchant's inventory"));
        return;
      }

      let inventory = await prisma.inventory.findUnique({
        where: { productId },
        include: {
          product: true,
          adjustments: {
            orderBy: { createdAt: "desc" },
            take: 20,
          },
        },
      });

      if (!inventory) {
        // Auto-initialize inventory if missing
        inventory = await prisma.inventory.create({
          data: {
            productId,
            availableQuantity: 0,
            reservedQuantity: 0,
            soldQuantity: 0,
          },
          include: {
            product: true,
            adjustments: true,
          },
        });
      }

      res.status(200).json(apiSuccess(inventory));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch inventory";
      res.status(500).json(apiError(message));
    }
  }
);

// ─── POST /api/inventory/:productId/adjust ────────────────────
router.post(
  "/:productId/adjust",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const productId = req.params.productId as string;
    const { quantityChange, reason } = req.body as {
      quantityChange?: number;
      reason?: string;
    };

    if (quantityChange === undefined || typeof quantityChange !== "number" || isNaN(quantityChange) || quantityChange === 0) {
      res.status(400).json(apiError("Valid non-zero quantityChange is required"));
      return;
    }

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      res.status(400).json(apiError("Reason for inventory adjustment is required"));
      return;
    }

    try {
      const merchant = await prisma.merchant.findFirst({
        where: { ownerId: req.user!.id },
      });

      if (!merchant) {
        res.status(400).json(apiError("Merchant profile required"));
        return;
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        res.status(404).json(apiError("Product not found"));
        return;
      }

      if (product.merchantId !== merchant.id) {
        res.status(403).json(apiError("You are not authorized to modify another merchant's inventory"));
        return;
      }

      // Find or create inventory in transaction with check on non-negative quantity
      const result = await prisma.$transaction(async (tx) => {
        let inv = await tx.inventory.findUnique({
          where: { productId },
        });

        if (!inv) {
          inv = await tx.inventory.create({
            data: {
              productId,
              availableQuantity: 0,
              reservedQuantity: 0,
              soldQuantity: 0,
            },
          });
        }

        const newAvailable = inv.availableQuantity + quantityChange;
        if (newAvailable < 0) {
          throw new Error(`Insufficient stock. Current available: ${inv.availableQuantity}, requested change: ${quantityChange}`);
        }

        const updated = await tx.inventory.update({
          where: { id: inv.id },
          data: {
            availableQuantity: newAvailable,
            adjustments: {
              create: {
                quantityChange,
                reason: reason.trim(),
              },
            },
          },
          include: {
            adjustments: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        });

        return updated;
      });

      res.status(200).json(apiSuccess(result));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to adjust inventory";
      const status = message.includes("Insufficient stock") ? 400 : 500;
      res.status(status).json(apiError(message));
    }
  }
);

// ─── PATCH /api/inventory/:productId ──────────────────────────
router.patch(
  "/:productId",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const productId = req.params.productId as string;
    const { availableQuantity, reservedQuantity, soldQuantity, reason } = req.body as {
      availableQuantity?: number;
      reservedQuantity?: number;
      soldQuantity?: number;
      reason?: string;
    };

    if (
      (availableQuantity !== undefined && (typeof availableQuantity !== "number" || availableQuantity < 0)) ||
      (reservedQuantity !== undefined && (typeof reservedQuantity !== "number" || reservedQuantity < 0)) ||
      (soldQuantity !== undefined && (typeof soldQuantity !== "number" || soldQuantity < 0))
    ) {
      res.status(400).json(apiError("Quantities must be non-negative integers"));
      return;
    }

    try {
      const merchant = await prisma.merchant.findFirst({
        where: { ownerId: req.user!.id },
      });

      if (!merchant) {
        res.status(400).json(apiError("Merchant profile required"));
        return;
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        res.status(404).json(apiError("Product not found"));
        return;
      }

      if (product.merchantId !== merchant.id) {
        res.status(403).json(apiError("You are not authorized to modify another merchant's inventory"));
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        let inv = await tx.inventory.findUnique({
          where: { productId },
        });

        if (!inv) {
          inv = await tx.inventory.create({
            data: {
              productId,
              availableQuantity: 0,
              reservedQuantity: 0,
              soldQuantity: 0,
            },
          });
        }

        const quantityChange =
          availableQuantity !== undefined ? availableQuantity - inv.availableQuantity : 0;

        const updated = await tx.inventory.update({
          where: { id: inv.id },
          data: {
            ...(availableQuantity !== undefined ? { availableQuantity } : {}),
            ...(reservedQuantity !== undefined ? { reservedQuantity } : {}),
            ...(soldQuantity !== undefined ? { soldQuantity } : {}),
            adjustments:
              quantityChange !== 0
                ? {
                    create: {
                      quantityChange,
                      reason: (reason || "Direct inventory update").trim(),
                    },
                  }
                : undefined,
          },
          include: {
            adjustments: {
              orderBy: { createdAt: "desc" },
              take: 20,
            },
          },
        });

        return updated;
      });

      res.status(200).json(apiSuccess(result));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update inventory";
      res.status(500).json(apiError(message));
    }
  }
);

export default router;
