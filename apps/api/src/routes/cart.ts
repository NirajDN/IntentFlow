import { Router, Response } from "express";
import prisma from "@intentflow/database";
import { apiError, apiSuccess } from "@intentflow/shared";
import {
  authenticateUser,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/cart
 */
router.get(
  "/",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const cart = await prisma.cart.findUnique({
        where: {
          userId: req.user!.id,
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  category: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                  inventory: {
                    select: {
                      availableQuantity: true,
                      reservedQuantity: true,
                      soldQuantity: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!cart) {
        return res.status(200).json(
          apiSuccess({
            id: null,
            userId: req.user!.id,
            items: [],
            totalAmount: 0,
            totalItems: 0,
          })
        );
      }

      const totalAmount = cart.items.reduce(
        (total, item) => total + item.product.price * item.quantity,
        0
      );

      const totalItems = cart.items.reduce(
        (total, item) => total + item.quantity,
        0
      );

      return res.status(200).json(
        apiSuccess({
          ...cart,
          totalAmount,
          totalItems,
        })
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch cart";

      return res.status(500).json(apiError(message));
    }
  }
);

/**
 * POST /api/cart/items
 *
 * Body:
 * {
 *   "productId": "...",
 *   "quantity": 1
 * }
 */
router.post(
  "/items",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const { productId, quantity } = req.body as {
      productId?: unknown;
      quantity?: unknown;
    };

    if (typeof productId !== "string" || !productId.trim()) {
      return res.status(400).json(apiError("productId is required"));
    }

    const parsedQuantity =
      quantity === undefined ? 1 : Number(quantity);

    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > 100
    ) {
      return res
        .status(400)
        .json(apiError("quantity must be an integer between 1 and 100"));
    }

    try {
      const product = await prisma.product.findFirst({
        where: {
          id: productId,
          isActive: true,
        },
        include: {
          inventory: true,
        },
      });

      if (!product) {
        return res.status(404).json(apiError("Product not found"));
      }

      if (!product.inventory || product.inventory.availableQuantity < 1) {
        return res.status(409).json(apiError("Product is out of stock"));
      }

      const cart = await prisma.cart.upsert({
        where: {
          userId: req.user!.id,
        },
        create: {
          userId: req.user!.id,
        },
        update: {},
      });

      const existingItem = await prisma.cartItem.findUnique({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId: product.id,
          },
        },
      });

      const newQuantity =
        (existingItem?.quantity ?? 0) + parsedQuantity;

      if (newQuantity > product.inventory.availableQuantity) {
        return res.status(409).json(
          apiError(
            `Only ${product.inventory.availableQuantity} unit(s) available`
          )
        );
      }

      const item = await prisma.cartItem.upsert({
        where: {
          cartId_productId: {
            cartId: cart.id,
            productId: product.id,
          },
        },
        create: {
          cartId: cart.id,
          productId: product.id,
          quantity: parsedQuantity,
        },
        update: {
          quantity: newQuantity,
        },
        include: {
          product: true,
        },
      });

      return res.status(201).json(apiSuccess(item));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add item to cart";

      return res.status(500).json(apiError(message));
    }
  }
);

/**
 * PATCH /api/cart/items/:itemId
 *
 * Body:
 * {
 *   "quantity": 2
 * }
 */
router.patch(
  "/items/:itemId",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const itemId = String(req.params.itemId);

    const { quantity } = req.body as {
      quantity?: unknown;
    };

    const parsedQuantity = Number(quantity);

    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > 100
    ) {
      return res
        .status(400)
        .json(apiError("quantity must be an integer between 1 and 100"));
    }

    try {
      const item = await prisma.cartItem.findFirst({
        where: {
          id: itemId,
          cart: {
            userId: req.user!.id,
          },
        },
      });

      if (!item) {
        return res.status(404).json(apiError("Cart item not found"));
      }

      const product = await prisma.product.findUnique({
        where: {
          id: item.productId,
        },
        include: {
          inventory: true,
        },
      });

      if (!product) {
        return res.status(404).json(apiError("Product not found"));
      }

      if (
        !product.inventory ||
        product.inventory.availableQuantity < parsedQuantity
      ) {
        return res.status(409).json(
          apiError(
            `Only ${
              product.inventory?.availableQuantity ?? 0
            } unit(s) available`
          )
        );
      }

      const updated = await prisma.cartItem.update({
        where: {
          id: item.id,
        },
        data: {
          quantity: parsedQuantity,
        },
        include: {
          product: true,
        },
      });

      return res.status(200).json(apiSuccess(updated));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update cart item";

      return res.status(500).json(apiError(message));
    }
  }
);

/**
 * DELETE /api/cart/items/:itemId
 */
router.delete(
  "/items/:itemId",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const itemId = String(req.params.itemId);

    try {
      const item = await prisma.cartItem.findFirst({
        where: {
          id: itemId,
          cart: {
            userId: req.user!.id,
          },
        },
      });

      if (!item) {
        return res.status(404).json(apiError("Cart item not found"));
      }

      await prisma.cartItem.delete({
        where: {
          id: item.id,
        },
      });

      return res.status(200).json(
        apiSuccess({
          deleted: true,
          itemId: item.id,
        })
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to remove cart item";

      return res.status(500).json(apiError(message));
    }
  }
);

/**
 * DELETE /api/cart
 */
router.delete(
  "/",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const cart = await prisma.cart.findUnique({
        where: {
          userId: req.user!.id,
        },
      });

      if (!cart) {
        return res.status(200).json(
          apiSuccess({
            cleared: true,
          })
        );
      }

      await prisma.cartItem.deleteMany({
        where: {
          cartId: cart.id,
        },
      });

      return res.status(200).json(
        apiSuccess({
          cleared: true,
        })
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to clear cart";

      return res.status(500).json(apiError(message));
    }
  }
);

export default router;