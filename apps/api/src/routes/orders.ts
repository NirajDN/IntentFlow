import crypto from "node:crypto";
import { Router, Response } from "express";
import prisma from "@intentflow/database";
import { apiError, apiSuccess } from "@intentflow/shared";
import { razorpay } from "../services/razorpayService.js";
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
router.post(
  "/checkout",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;

      const cart = await prisma.cart.findUnique({
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
        return res.status(400).json(apiError("Cart is empty"));
      }

      // Validate cart items.
      for (const item of cart.items) {
        if (!item.product.isActive) {
          return res.status(409).json(
            apiError(
              `Product "${item.product.name}" is no longer available`
            )
          );
        }

        if (!item.product.inventory) {
          return res.status(409).json(
            apiError(
              `Product "${item.product.name}" has no inventory record`
            )
          );
        }

        if (
          item.product.inventory.availableQuantity <
          item.quantity
        ) {
          return res.status(409).json(
            apiError(
              `Only ${item.product.inventory.availableQuantity} unit(s) available for "${item.product.name}"`
            )
          );
        }

        if (!item.product.merchant.policy) {
          return res.status(409).json(
            apiError(
              `Merchant policy is not configured for "${item.product.name}"`
            )
          );
        }
      }

      // Calculate the order total from current product prices.
      const totalAmount = cart.items.reduce(
        (total, item) =>
          total + item.product.price * item.quantity,
        0
      );

      /*
       * For multiple merchants, use the strictest
       * autonomous spend limit.
       */
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

      /*
       * Create Order, OrderItems and PolicyAudit
       * atomically.
       */
      const order = await prisma.$transaction(
        async (tx) => {
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

          // Clear cart after successful order creation.
          await tx.cartItem.deleteMany({
            where: {
              cartId: cart.id,
            },
          });

          return createdOrder;
        }
      );

      return res.status(201).json(
        apiSuccess({
          order,
          policy: {
            decision: policyDecision,
            reason: policyReason,
            spendLimit,
            orderAmount: totalAmount,
          },
        })
      );
    } catch (err: unknown) {
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

      if (order.status !== "APPROVED") {
        return res.status(409).json(
          apiError(
            `Order is not ready for payment. Current status: ${order.status}`
          )
        );
      }

      /*
       * Prevent creating duplicate Razorpay orders.
       */
      const existingPayment = order.payments.find(
        (payment) =>
          payment.status === "CREATED" ||
          payment.status === "PENDING"
      );

      if (existingPayment?.razorpayOrderId) {
        return res.status(200).json(
          apiSuccess({
            orderId: order.id,
            orderStatus: order.status,
            paymentId: existingPayment.id,
            razorpayOrderId: existingPayment.razorpayOrderId,
            amount: Math.round(order.totalAmount * 100),
            currency: order.currency,
          })
        );
      }

      /*
       * Razorpay expects amount in the smallest currency unit.
       *
       * ₹29,999 -> 2999900 paise
       */
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(order.totalAmount * 100),
        currency: order.currency,
        receipt: `intentflow_${order.id}`,
        notes: {
          intentflowOrderId: order.id,
          userId: order.userId,
        },
      });

      const result = await prisma.$transaction(
        async (tx) => {
          const payment = await tx.payment.create({
            data: {
              orderId: order.id,
              amount: order.totalAmount,
              currency: order.currency,
              status: "CREATED",
              razorpayOrderId: razorpayOrder.id,
            },
          });

          const updatedOrder = await tx.order.update({
            where: {
              id: order.id,
            },
            data: {
              status: "PAYMENT_PENDING",
              razorpayOrderId: razorpayOrder.id,
            },
          });

          return {
            payment,
            order: updatedOrder,
          };
        }
      );

      return res.status(201).json(
        apiSuccess({
          orderId: result.order.id,
          orderStatus: result.order.status,
          paymentId: result.payment.id,
          razorpayOrderId: result.payment.razorpayOrderId,
          amount: Math.round(order.totalAmount * 100),
          currency: order.currency,
        })
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to create Razorpay payment";

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

      if (order.status !== "PAYMENT_PENDING") {
        return res.status(409).json(
          apiError(
            `Order is not awaiting payment. Current status: ${order.status}`
          )
        );
      }

      if (order.razorpayOrderId !== razorpay_order_id) {
        return res.status(400).json(
          apiError("Razorpay order ID does not match this IntentFlow order")
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
          const updatedPayment = await tx.payment.update({
            where: {
              id: payment.id,
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
              id: order.id,
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
      const message =
        err instanceof Error
          ? err.message
          : "Failed to reject order";

      return res.status(500).json(apiError(message));
    }
  }
);

export default router;