import crypto from "node:crypto";
import { Router, Response } from "express";
import prisma from "@intentflow/database";
import { apiError, apiSuccess } from "@intentflow/shared";
import {
  getRazorpayKeyId,
  razorpay,
} from "../services/razorpayService.js";
import {
  authenticateUser,
  requireRole,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/orders/checkout
 *
 * Converts the authenticated user's cart into an order.
 *
 * Policy:
 * - total <= autonomous spend limit -> AUTO_APPROVED
 * - total > autonomous spend limit  -> REQUIRES_APPROVAL
 */
const ACTIVE_ORDER_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "PAYMENT_PENDING",
] as const;

class CheckoutConflictError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "CheckoutConflictError";
    this.statusCode = statusCode;
  }
}

router.post(
  "/checkout",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM carts WHERE "userId" = ${userId} FOR UPDATE
        `;

        const activeOrder = await tx.order.findFirst({
          where: {
            userId,
            status: {
              in: [...ACTIVE_ORDER_STATUSES],
            },
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (activeOrder) {
          throw new CheckoutConflictError(
            `You already have an active order (${activeOrder.status}). Complete it before creating a new one.`,
            409
          );
        }

        const cart = await tx.cart.findUnique({
          where: {
            userId,
          },
          include: {
            items: {
              include: {
                product: {
                  include: {
                    inventory: true,
                    merchant: {
                      include: {
                        policy: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!cart || cart.items.length === 0) {
          throw new CheckoutConflictError("Cart is empty", 400);
        }

        // Lock all inventory rows for products in this cart to
        // prevent concurrent checkouts from overselling the same stock.
        const productIds = cart.items.map((i) => i.productId);
        if (productIds.length > 0) {
          await tx.$queryRaw`
            SELECT id FROM inventories
            WHERE "productId" = ANY(${productIds}::text[])
            FOR UPDATE
          `;
        }

        for (const item of cart.items) {
          if (!item.product.isActive) {
            throw new CheckoutConflictError(
              `Product "${item.product.name}" is no longer available`,
              409
            );
          }

          if (!item.product.inventory) {
            throw new CheckoutConflictError(
              `Product "${item.product.name}" has no inventory record`,
              409
            );
          }

          if (
            item.product.inventory.availableQuantity <
            item.quantity
          ) {
            throw new CheckoutConflictError(
              `Only ${item.product.inventory.availableQuantity} unit(s) available for "${item.product.name}"`,
              409
            );
          }

          if (!item.product.merchant.policy) {
            throw new CheckoutConflictError(
              `Merchant policy is not configured for "${item.product.name}"`,
              409
            );
          }
        }

        const totalAmount = cart.items.reduce(
          (total, item) =>
            total + item.product.price * item.quantity,
          0
        );

        const policies = cart.items.map(
          (item) => item.product.merchant.policy!
        );

        const spendLimit = Math.min(
          ...policies.map(
            (policy) =>
              policy.defaultAutonomousSpendLimit
          )
        );

        const policyDecision =
          totalAmount <= spendLimit
            ? "AUTO_APPROVED"
            : "REQUIRES_APPROVAL";

        const policyReason =
          policyDecision === "AUTO_APPROVED"
            ? `Order total ₹${totalAmount.toFixed(
              2
            )} is within the autonomous spend limit of ₹${spendLimit.toFixed(
              2
            )}.`
            : `Order total ₹${totalAmount.toFixed(
              2
            )} exceeds the autonomous spend limit of ₹${spendLimit.toFixed(
              2
            )}. Approval is required before payment.`;

        const orderStatus =
          policyDecision === "AUTO_APPROVED"
            ? "APPROVED"
            : "PENDING_APPROVAL";

        const createdOrder = await tx.order.create({
          data: {
            userId,
            totalAmount,
            currency:
              cart.items[0]!.product.currency,
            status: orderStatus,
            policyDecision,
            policyReason,

            items: {
              create: cart.items.map((item) => ({
                productId: item.productId,
                productName: item.product.name,
                quantity: item.quantity,
                unitPrice: item.product.price,
              })),
            },

            policyAudits: {
              create: {
                decision: policyDecision,
                reason: policyReason,
                spendLimit,
                orderAmount: totalAmount,
                metadata: {
                  cartId: cart.id,
                  itemCount: cart.items.length,
                },
              },
            },
          },

          include: {
            items: true,
            policyAudits: true,
          },
        });

        await tx.cartItem.deleteMany({
          where: {
            cartId: cart.id,
          },
        });

        // Decrement availableQuantity and increment reservedQuantity
        // for each ordered product inside the same locked transaction.
        // This prevents concurrent checkouts from overselling stock.
        for (const item of cart.items) {
          await tx.inventory.update({
            where: { productId: item.productId },
            data: {
              availableQuantity: { decrement: item.quantity },
              reservedQuantity:  { increment: item.quantity },
            },
          });
        }

        return {
          order: createdOrder,
          policy: {
            decision: policyDecision,
            reason: policyReason,
            spendLimit,
            orderAmount: totalAmount,
          },
        };
      });

      return res.status(201).json(apiSuccess(result));
    } catch (err: unknown) {
      if (err instanceof CheckoutConflictError) {
        return res.status(err.statusCode).json(apiError(err.message));
      }

      const message =
        err instanceof Error
          ? err.message
          : "Checkout failed";

      return res.status(500).json(
        apiError(message)
      );
    }
  }
);

/**
 * POST /api/orders/:orderId/payment
 *
 * Creates a Razorpay order for an approved IntentFlow order.
 *
 * Flow:
 * APPROVED
 * -> create Razorpay order
 * -> Payment: CREATED
 * -> Order: PAYMENT_PENDING
 */
router.post(
  "/:orderId/payment",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const orderId = String(req.params.orderId);

    try {
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          userId: req.user!.id,
        },
        include: {
          payments: true,
        },
      });

      if (!order) {
        return res.status(404).json(
          apiError("Order not found")
        );
      }

      // Block invalid terminal/non-payment-ready statuses upfront.
      if (
        order.status === "PENDING_APPROVAL" ||
        order.status === "CANCELLED" ||
        order.status === "FAILED"
      ) {
        return res.status(409).json(
          apiError(
            `Order is not ready for payment. Current status: ${order.status}`
          )
        );
      }

      if (order.status === "PAID") {
        return res.status(409).json(
          apiError("Order has already been paid")
        );
      }

      if (order.status !== "APPROVED" && order.status !== "PAYMENT_PENDING") {
        return res.status(409).json(
          apiError(
            `Order is not ready for payment. Current status: ${order.status}`
          )
        );
      }

      /*
       * All state-changing work happens inside a single serialisable
       * transaction so concurrent requests cannot both create a Razorpay
       * order for the same IntentFlow order.
       *
       * Strategy:
       * 1. Lock the order row with SELECT … FOR UPDATE.
       * 2. Re-read the current status and payments inside the lock.
       * 3. If already PAYMENT_PENDING → reuse existing Razorpay order.
       * 4. If still APPROVED and no active payment → create Razorpay
       *    order (outside the lock but guarded by step 2) then persist.
       *
       * Because Razorpay order creation is a remote call it cannot sit
       * inside the DB transaction.  We therefore:
       *  a. Acquire the lock and read state.
       *  b. Release the lock, call Razorpay if needed.
       *  c. Re-acquire the lock and write only if state hasn't changed.
       */

      // ── Step A: read locked state ────────────────────────────────────
      type LockedState = {
        status: string;
        totalAmount: number;
        currency: string;
        activePayment: {
          id: string;
          razorpayOrderId: string | null;
          status: string;
        } | null;
      };

      const lockedState = await prisma.$transaction(async (tx) => {
        // Lock the order row.
        await tx.$queryRaw`
          SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE
        `;

        const locked = await tx.order.findFirst({
          where: { id: orderId, userId: req.user!.id },
          include: { payments: true },
        });

        if (!locked) throw new Error("Order not found inside transaction");

        const active = locked.payments.find(
          (p) => p.status === "CREATED" || p.status === "PENDING"
        ) ?? null;

        return {
          status: locked.status,
          totalAmount: locked.totalAmount,
          currency: locked.currency,
          activePayment: active
            ? { id: active.id, razorpayOrderId: active.razorpayOrderId, status: active.status }
            : null,
        } satisfies LockedState;
      });

      // ── Fast-path: PAYMENT_PENDING already has a Razorpay order ─────
      if (lockedState.status === "PAYMENT_PENDING") {
        if (!lockedState.activePayment?.razorpayOrderId) {
          return res.status(409).json(
            apiError(
              "Payment is pending, but no active Razorpay order was found"
            )
          );
        }

        return res.status(200).json(
          apiSuccess({
            orderId,
            orderStatus: lockedState.status,
            paymentId: lockedState.activePayment.id,
            razorpayOrderId: lockedState.activePayment.razorpayOrderId,
            amount: Math.round(lockedState.totalAmount * 100),
            currency: lockedState.currency,
          })
        );
      }

      // ── Fast-path: APPROVED but already has an active payment record ─
      if (lockedState.activePayment?.razorpayOrderId) {
        return res.status(200).json(
          apiSuccess({
            orderId,
            orderStatus: lockedState.status,
            paymentId: lockedState.activePayment.id,
            razorpayOrderId: lockedState.activePayment.razorpayOrderId,
            amount: Math.round(lockedState.totalAmount * 100),
            currency: lockedState.currency,
          })
        );
      }

      if (lockedState.status !== "APPROVED") {
        return res.status(409).json(
          apiError(
            `Order is not ready for payment. Current status: ${lockedState.status}`
          )
        );
      }

      // ── Step B: create Razorpay order (remote call, outside TX) ─────
      /*
       * Razorpay expects amount in the smallest currency unit.
       * ₹29,999 -> 2999900 paise
       */
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(lockedState.totalAmount * 100),
        currency: lockedState.currency,
        receipt: `intentflow_${orderId}`,
        notes: {
          intentflowOrderId: orderId,
          userId: req.user!.id,
        },
      });

      // ── Step C: persist atomically, guard against concurrent writes ──
      const result = await prisma.$transaction(async (tx) => {
        // Re-lock and re-read to ensure state hasn't changed since step A.
        await tx.$queryRaw`
          SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE
        `;

        const currentOrder = await tx.order.findFirst({
          where: { id: orderId, userId: req.user!.id },
          include: { payments: true },
        });

        if (!currentOrder) {
          throw new Error("Order is no longer available for payment");
        }

        // Another request already moved this order to PAYMENT_PENDING.
        if (currentOrder.status === "PAYMENT_PENDING") {
          const existingActive = currentOrder.payments.find(
            (p) => p.status === "CREATED" || p.status === "PENDING"
          );

          if (existingActive?.razorpayOrderId) {
            return { payment: existingActive, order: currentOrder };
          }
        }

        if (currentOrder.status !== "APPROVED") {
          throw new Error(
            `Order is no longer approved for payment. Current status: ${currentOrder.status}`
          );
        }

        // Guard: another concurrent request may have just created a payment.
        const alreadyActive = currentOrder.payments.find(
          (p) =>
            (p.status === "CREATED" || p.status === "PENDING") &&
            p.razorpayOrderId
        );

        if (alreadyActive) {
          return { payment: alreadyActive, order: currentOrder };
        }

        const payment = await tx.payment.create({
          data: {
            orderId: currentOrder.id,
            amount: currentOrder.totalAmount,
            currency: currentOrder.currency,
            status: "CREATED",
            razorpayOrderId: razorpayOrder.id,
          },
        });

        const updatedOrder = await tx.order.update({
          where: { id: currentOrder.id },
          data: {
            status: "PAYMENT_PENDING",
            razorpayOrderId: razorpayOrder.id,
          },
        });

        return { payment, order: updatedOrder };
      });

      return res.status(201).json(
        apiSuccess({
          orderId: result.order.id,
          orderStatus: result.order.status,
          paymentId: result.payment.id,
          razorpayOrderId: result.payment.razorpayOrderId,
          amount: Math.round(lockedState.totalAmount * 100),
          currency: lockedState.currency,
        })
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to create Razorpay payment";

      if (
        message.includes("no longer approved") ||
        message.includes("no longer available") ||
        message.includes("no longer active")
      ) {
        return res.status(409).json(apiError(message));
      }

      return res.status(500).json(
        apiError(message)
      );
    }
  }
);


/**
 * POST /api/orders/:orderId/payment/verify
 *
 * Verifies a successful Razorpay payment and updates
 * the IntentFlow payment/order state.
 *
 * Flow:
 * Razorpay Checkout
 * -> verify signature
 * -> Payment: SUCCESS
 * -> Order: PAID
 */
router.post(
  "/:orderId/payment/verify",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const orderId = String(req.params.orderId);

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body as {
      razorpay_order_id?: unknown;
      razorpay_payment_id?: unknown;
      razorpay_signature?: unknown;
    };

    if (
      typeof razorpay_order_id !== "string" ||
      !razorpay_order_id ||
      typeof razorpay_payment_id !== "string" ||
      !razorpay_payment_id ||
      typeof razorpay_signature !== "string" ||
      !razorpay_signature
    ) {
      return res.status(400).json(
        apiError(
          "razorpay_order_id, razorpay_payment_id and razorpay_signature are required"
        )
      );
    }

    try {
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          userId: req.user!.id,
        },
        include: {
          payments: true,
        },
      });

      if (!order) {
        return res.status(404).json(
          apiError("Order not found")
        );
      }

      if (order.razorpayOrderId !== razorpay_order_id) {
        return res.status(400).json(
          apiError("Razorpay order ID does not match this IntentFlow order")
        );
      }

      const successfulPayment = order.payments.find(
        (item) =>
          item.status === "SUCCESS" &&
          item.razorpayOrderId === razorpay_order_id &&
          item.razorpayPaymentId === razorpay_payment_id
      );

      if (order.status === "PAID" && successfulPayment) {
        const paidOrder = await prisma.order.findFirst({
          where: {
            id: order.id,
            userId: req.user!.id,
          },
          include: {
            items: true,
            payments: true,
            policyAudits: true,
          },
        });

        return res.status(200).json(
          apiSuccess({
            order: paidOrder ?? order,
            payment: successfulPayment,
            message: "Payment already verified",
          })
        );
      }

      if (order.status === "PAID") {
        return res.status(409).json(
          apiError("Order has already been paid")
        );
      }

      if (order.status !== "PAYMENT_PENDING") {
        return res.status(409).json(
          apiError(
            `Order is not awaiting payment. Current status: ${order.status}`
          )
        );
      }

      const payment = order.payments.find(
        (item) =>
          item.razorpayOrderId === razorpay_order_id &&
          (item.status === "CREATED" ||
            item.status === "PENDING")
      );

      if (!payment) {
        return res.status(404).json(
          apiError("Payment record not found")
        );
      }

      /*
       * Razorpay signature verification:
       *
       * HMAC_SHA256(
       *   razorpay_order_id + "|" + razorpay_payment_id,
       *   RAZORPAY_KEY_SECRET
       * )
       */
      const keySecret = process.env["RAZORPAY_KEY_SECRET"];

      if (!keySecret) {
        return res.status(500).json(
          apiError("Razorpay secret is not configured")
        );
      }

      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(
          `${razorpay_order_id}|${razorpay_payment_id}`
        )
        .digest("hex");

      const expectedBuffer = Buffer.from(expectedSignature, "utf8");
      const receivedBuffer = Buffer.from(razorpay_signature, "utf8");

      const signaturesMatch =
        expectedBuffer.length === receivedBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

      if (!signaturesMatch) {
        await prisma.payment.update({
          where: {
            id: payment.id,
          },
          data: {
            status: "FAILED",
            failureReason: "Invalid Razorpay payment signature",
          },
        });

        return res.status(400).json(
          apiError("Invalid Razorpay payment signature")
        );
      }

      const result = await prisma.$transaction(
        async (tx) => {
          // Lock the order row to prevent concurrent verify attempts.
          await tx.$queryRaw`
            SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE
          `;

          const currentOrder = await tx.order.findFirst({
            where: {
              id: order.id,
              userId: req.user!.id,
              status: "PAYMENT_PENDING",
            },
            include: {
              payments: true,
            },
          });

          if (!currentOrder) {
            const paidOrder = await tx.order.findFirst({
              where: {
                id: order.id,
                userId: req.user!.id,
                status: "PAID",
              },
              include: {
                items: true,
                payments: true,
                policyAudits: true,
              },
            });

            const alreadyPaid = paidOrder?.payments.find(
              (item) =>
                item.status === "SUCCESS" &&
                item.razorpayOrderId === razorpay_order_id &&
                item.razorpayPaymentId === razorpay_payment_id
            );

            if (paidOrder && alreadyPaid) {
              return {
                payment: alreadyPaid,
                order: paidOrder,
              };
            }

            throw new Error(
              "Order is no longer awaiting payment verification"
            );
          }

          const currentPayment = currentOrder.payments.find(
            (item) =>
              item.id === payment.id &&
              item.razorpayOrderId === razorpay_order_id &&
              (item.status === "CREATED" ||
                item.status === "PENDING")
          );

          if (!currentPayment) {
            throw new Error("Payment record is no longer active");
          }

          const updatedPayment = await tx.payment.update({
            where: {
              id: currentPayment.id,
            },
            data: {
              status: "SUCCESS",
              razorpayPaymentId: razorpay_payment_id,
              razorpaySignature: razorpay_signature,
              failureReason: null,
            },
          });

          const updatedOrder = await tx.order.update({
            where: {
              id: currentOrder.id,
            },
            data: {
              status: "PAID",
            },
            include: {
              items: true,
              payments: true,
              policyAudits: true,
            },
          });

          // Move reserved stock to sold stock for each ordered product.
          for (const item of updatedOrder.items) {
            await tx.inventory.updateMany({
              where: { productId: item.productId },
              data: {
                reservedQuantity: { decrement: item.quantity },
                soldQuantity:     { increment: item.quantity },
              },
            });
          }

          return {
            payment: updatedPayment,
            order: updatedOrder,
          };
        }
      );

      return res.status(200).json(
        apiSuccess({
          order: result.order,
          payment: result.payment,
          message: "Payment verified successfully",
        })
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to verify payment";

      if (
        message.includes("no longer awaiting payment") ||
        message.includes("no longer active")
      ) {
        return res.status(409).json(apiError(message));
      }

      return res.status(500).json(
        apiError(message)
      );
    }
  }
);
/**
 * GET /api/orders/merchant
 *
 * Returns orders containing products owned by the
 * authenticated merchant.
 *
 * Used by the merchant approval dashboard.
 */
router.get(
  "/merchant",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orders = await prisma.order.findMany({
        where: {
          items: {
            some: {
              product: {
                merchant: {
                  ownerId: req.user!.id,
                },
              },
            },
          },
        },
        include: {
          items: {
            include: {
              product: {
                include: {
                  merchant: true,
                },
              },
            },
          },
          payments: true,
          policyAudits: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.status(200).json(
        apiSuccess(orders)
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to fetch merchant orders";

      return res.status(500).json(
        apiError(message)
      );
    }
  }
);

/**
 * GET /api/orders
 *
 * Returns the authenticated user's orders.
 */
router.get(
  "/",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orders = await prisma.order.findMany({
        where: {
          userId: req.user!.id,
        },
        include: {
          items: true,
          payments: true,
          policyAudits: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return res.status(200).json(
        apiSuccess(orders)
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to fetch orders";

      return res.status(500).json(
        apiError(message)
      );
    }
  }
);

/**
 * GET /api/orders/razorpay-key
 *
 * Returns the public Razorpay key ID for checkout.
 * Must be registered before /:orderId to avoid route shadowing.
 */
router.get(
  "/razorpay-key",
  authenticateUser,
  async (_req: AuthenticatedRequest, res: Response) => {
    return res.status(200).json(
      apiSuccess({
        keyId: getRazorpayKeyId(),
      })
    );
  }
);

/**
 * GET /api/orders/:orderId
 *
 * Returns one order belonging to the authenticated user.
 */
router.get(
  "/:orderId",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const orderId = String(req.params.orderId);

    try {
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          userId: req.user!.id,
        },
        include: {
          items: true,
          payments: true,
          policyAudits: true,
        },
      });

      if (!order) {
        return res.status(404).json(
          apiError("Order not found")
        );
      }

      return res.status(200).json(
        apiSuccess(order)
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to fetch order";

      return res.status(500).json(
        apiError(message)
      );
    }
  }
);

/**
 * POST /api/orders/:orderId/approve
 *
 * Merchant owner approves an order that requires approval.
 *
 * Flow:
 * PENDING_APPROVAL -> APPROVED
 */
router.post(
  "/:orderId/approve",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const orderId = String(req.params.orderId);

    try {
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          items: {
            some: {
              product: {
                merchant: {
                  ownerId: req.user!.id,
                },
              },
            },
          },
        },
        include: {
          items: true,
          payments: true,
          policyAudits: true,
        },
      });

      if (!order) {
        return res.status(404).json(
          apiError(
            "Order not found or not owned by current merchant"
          )
        );
      }

      if (order.status !== "PENDING_APPROVAL") {
        return res.status(409).json(
          apiError(
            `Order cannot be approved from status ${order.status}`
          )
        );
      }

      const updatedOrder = await prisma.$transaction(
        async (tx) => {
          // Re-lock the order row so two simultaneous approvals
          // cannot both pass and create duplicate audit records.
          await tx.$queryRaw`
            SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE
          `;

          const current = await tx.order.findFirst({
            where: { id: order.id },
            select: { status: true },
          });

          if (current?.status !== "PENDING_APPROVAL") {
            throw new CheckoutConflictError(
              `Order cannot be approved from status ${current?.status ?? "unknown"}`,
              409
            );
          }

          const updated = await tx.order.update({
            where: {
              id: order.id,
            },
            data: {
              status: "APPROVED",
            },
            include: {
              items: true,
              payments: true,
              policyAudits: true,
            },
          });

          await tx.orderPolicyDecision.create({
            data: {
              orderId: order.id,
              decision: "AUTO_APPROVED",
              reason: `Order approved by merchant ${req.user!.name}.`,
              spendLimit: order.totalAmount,
              orderAmount: order.totalAmount,
              metadata: {
                approvedByUserId: req.user!.id,
                approvalType: "MERCHANT_APPROVAL",
              },
            },
          });

          return updated;
        }
      );

      return res.status(200).json(
        apiSuccess({
          order: updatedOrder,
          message: "Order approved successfully",
        })
      );
    } catch (err: unknown) {
      if (err instanceof CheckoutConflictError) {
        return res.status(err.statusCode).json(apiError(err.message));
      }

      const message =
        err instanceof Error
          ? err.message
          : "Failed to approve order";

      return res.status(500).json(
        apiError(message)
      );
    }
  }
);

/**
 * POST /api/orders/:orderId/reject
 *
 * Merchant owner rejects an order that requires approval.
 *
 * Flow:
 * PENDING_APPROVAL -> CANCELLED
 */
router.post(
  "/:orderId/reject",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const orderId = String(req.params.orderId);

    const { reason } = req.body as {
      reason?: unknown;
    };

    const rejectionReason =
      typeof reason === "string" && reason.trim()
        ? reason.trim()
        : "Order rejected by merchant.";

    try {
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          items: {
            some: {
              product: {
                merchant: {
                  ownerId: req.user!.id,
                },
              },
            },
          },
        },
        include: {
          items: true,
          payments: true,
          policyAudits: true,
        },
      });

      if (!order) {
        return res.status(404).json(
          apiError(
            "Order not found or not owned by current merchant"
          )
        );
      }

      if (order.status !== "PENDING_APPROVAL") {
        return res.status(409).json(
          apiError(
            `Order cannot be rejected from status ${order.status}`
          )
        );
      }

      const updatedOrder = await prisma.$transaction(
        async (tx) => {
          // Re-lock so two simultaneous reject calls cannot both proceed.
          await tx.$queryRaw`
            SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE
          `;

          const current = await tx.order.findFirst({
            where: { id: order.id },
            include: { items: true },
          });

          if (current?.status !== "PENDING_APPROVAL") {
            throw new CheckoutConflictError(
              `Order cannot be rejected from status ${current?.status ?? "unknown"}`,
              409
            );
          }

          const updated = await tx.order.update({
            where: {
              id: order.id,
            },
            data: {
              status: "CANCELLED",
              policyReason: rejectionReason,
            },
            include: {
              items: true,
              payments: true,
              policyAudits: true,
            },
          });

          await tx.orderPolicyDecision.create({
            data: {
              orderId: order.id,
              decision: "REJECTED",
              reason: rejectionReason,
              spendLimit: null,
              orderAmount: order.totalAmount,
              metadata: {
                rejectedByUserId: req.user!.id,
                rejectionType: "MERCHANT_REJECTION",
              },
            },
          });

          // Return the reserved stock to available since the order
          // was rejected before any payment was made.
          for (const item of (current.items ?? [])) {
            await tx.inventory.updateMany({
              where: { productId: item.productId },
              data: {
                reservedQuantity: { decrement: item.quantity },
                availableQuantity: { increment: item.quantity },
              },
            });
          }

          return updated;
        }
      );

      return res.status(200).json(
        apiSuccess({
          order: updatedOrder,
          message: "Order rejected successfully",
        })
      );
    } catch (err: unknown) {
      if (err instanceof CheckoutConflictError) {
        return res.status(err.statusCode).json(apiError(err.message));
      }

      const message =
        err instanceof Error
          ? err.message
          : "Failed to reject order";

      return res.status(500).json(apiError(message));
    }
  }
);

export default router;