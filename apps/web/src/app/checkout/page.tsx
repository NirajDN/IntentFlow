"use client";

import { useEffect, useState } from "react";
import { apiFetch, getStoredUser, selectCheckoutOrder } from "../../lib/api";
import BrandIcon from "../../components/BrandIcon";

// Razorpay global type augmentation
interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
  };
  theme?: {
    color: string;
  };
  handler: (response: RazorpayResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
}

interface WindowWithRazorpay extends Window {
  Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
}

type Order = {
  id: string;
  totalAmount: number;
  currency: string;
  status: string;
  policyDecision: string;
  policyReason: string | null;
  razorpayOrderId: string | null;
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
};

type CheckoutResponse = {
  order: Order;
  policy: {
    decision: string;
    reason: string;
    spendLimit: number;
    orderAmount: number;
  };
};

type PaymentResponse = {
  orderId: string;
  orderStatus: string;
  paymentId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
};

export default function CheckoutPage() {
  const [user, setUser] = useState<ReturnType<typeof getStoredUser>>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [checkoutResult, setCheckoutResult] =
    useState<CheckoutResponse | null>(null);
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);

    if (!storedUser) {
      window.location.href = "/login";
      return;
    }

    void loadCartAndOrder();
  }, []);

  useEffect(() => {
    if (order?.status !== "PENDING_APPROVAL") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadCartAndOrder({ silent: true });
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [order?.id, order?.status]);

  async function loadCartAndOrder(options?: { silent?: boolean }) {
    const silent = options?.silent === true;

    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const response = await apiFetch<Order[]>("/api/orders");

      if (!response.success) {
        throw new Error(response.error ?? "Failed to load orders");
      }

      const nextOrder = selectCheckoutOrder(response.data ?? []);

      setOrder(nextOrder ?? null);

      if (nextOrder?.status === "PAYMENT_PENDING" && nextOrder.razorpayOrderId) {
        setPayment((current) =>
          current ?? {
            orderId: nextOrder.id,
            orderStatus: nextOrder.status,
            paymentId: "",
            razorpayOrderId: nextOrder.razorpayOrderId as string,
            amount: Math.round(nextOrder.totalAmount * 100),
            currency: nextOrder.currency,
          }
        );
      }

      if (silent) {
        setError("");
      }
    } catch (err) {
      if (!silent) {
        setOrder(null);
      }

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load checkout information."
      );
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function createCheckoutOrder() {
    setCheckoutLoading(true);
    setError("");
    setSuccess("");

    try {
      const response =
        await apiFetch<CheckoutResponse>("/api/orders/checkout", {
          method: "POST",
          body: JSON.stringify({}),
        });

      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Checkout failed");
      }

      setCheckoutResult(response.data);
      setOrder(response.data.order);

      if (
        response.data.policy.decision === "REQUIRES_APPROVAL"
      ) {
        setSuccess(
          "Your order requires merchant approval before payment."
        );
      } else {
        setSuccess(
          "Your order has been approved and is ready for payment."
        );
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to create order.";

      setError(message);

      if (message.includes("already have an active order")) {
        await loadCartAndOrder();
      }
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function startPayment() {
    if (!order) {
      setError("No order is available for payment.");
      return;
    }



    if (
  order.status !== "APPROVED" &&
  order.status !== "PAYMENT_PENDING"
) {
  setError(
    `This order is not ready for payment. Current status: ${order.status}`
  );
  return;
}

    setPaymentLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch<PaymentResponse>(
        `/api/orders/${order.id}/payment`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      if (!response.success || !response.data) {
        throw new Error(
          response.error ?? "Failed to prepare payment"
        );
      }

      const paymentData = response.data;
      setPayment(paymentData);
      setOrder((current) =>
        current
          ? {
              ...current,
              status: paymentData.orderStatus,
              razorpayOrderId: paymentData.razorpayOrderId,
            }
          : current
      );

      const keyResponse = await apiFetch<{ keyId: string }>(
        "/api/orders/razorpay-key"
      );

      if (!keyResponse.success || !keyResponse.data?.keyId) {
        throw new Error(
          keyResponse.error ?? "Failed to load Razorpay key"
        );
      }

      await loadRazorpayScript();

      const currentUser = getStoredUser();

      const razorpay = new (window as unknown as WindowWithRazorpay).Razorpay({
        key: keyResponse.data.keyId,
        amount: paymentData.amount,
        currency: paymentData.currency,
        name: "IntentFlow",
        description: `IntentFlow Order ${order.id}`,
        order_id: paymentData.razorpayOrderId,
        prefill: {
          name: currentUser?.name ?? undefined,
          email: currentUser?.email ?? undefined,
        },
        theme: {
          color: "#7c3aed",
        },
        handler: async (razorpayResponse) => {
          await verifyPayment(
            razorpayResponse.razorpay_order_id,
            razorpayResponse.razorpay_payment_id,
            razorpayResponse.razorpay_signature
          );
        },
        modal: {
          ondismiss: () => {
            setPaymentLoading(false);
          },
        },
      });

      razorpay.open();
    } catch (err) {
      setPaymentLoading(false);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to start payment."
      );
    }
  }

  async function verifyPayment(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
  ) {
    if (!order) {
      setPaymentLoading(false);
      return;
    }

    try {
      const response =
        await apiFetch<{
          order: Order;
          payment: {
            id: string;
            status: string;
            razorpayOrderId: string | null;
            razorpayPaymentId: string | null;
          };
          message: string;
        }>(`/api/orders/${order.id}/payment/verify`, {
          method: "POST",
          body: JSON.stringify({
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
            razorpay_signature: razorpaySignature,
          }),
        });

      if (!response.success || !response.data) {
        throw new Error(
          response.error ?? "Payment verification failed"
        );
      }

      setOrder(response.data.order);
      setPaymentLoading(false);
      setSuccess("Payment successful! Your order is now PAID.");
      setError("");
    } catch (err) {
      setPaymentLoading(false);
      setError(
        err instanceof Error
          ? err.message
          : "Payment verification failed."
      );
    }
  }

  function loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as unknown as WindowWithRazorpay).Razorpay) {
        resolve();
        return;
      }

      const existingScript = document.querySelector(
        'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve());
        existingScript.addEventListener("error", () =>
          reject(new Error("Failed to load Razorpay"))
        );
        return;
      }

      const script = document.createElement("script");
      script.src =
        "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;

      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Razorpay"));

      document.body.appendChild(script);
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#05050f] text-white">
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <div className="text-3xl">⏳</div>
          <p className="mt-4 text-white/50">
            Loading checkout...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#05050f] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)",
          }}
        />

        <div
          className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(6,182,212,0.14) 0%, transparent 70%)",
          }}
        />
      </div>

      <nav className="relative z-10 flex items-center justify-between border-b border-white/[0.06] px-6 py-5 md:px-12">
        <a href="/" className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
            style={{
              background:
                "linear-gradient(135deg, #7c3aed, #4f46e5)",
              boxShadow:
                "0 4px 16px rgba(124,58,237,0.4)",
            }}
          >
            <BrandIcon size={18} />
          </div>

          <span className="text-lg font-bold tracking-tight">
            IntentFlow
          </span>
        </a>

        <div className="flex items-center gap-3">
          <a
            href="/cart"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white"
          >
            Cart
          </a>

          <a
            href={user?.role === "MERCHANT" ? "/merchant/orders" : "/orders"}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white"
          >
            Orders
          </a>

          <a
            href="/"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:text-white"
          >
            Home
          </a>
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-3xl px-6 py-16">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
            Checkout
          </p>

          <h1 className="mt-2 text-4xl font-black">
            Complete your order
          </h1>

          <p className="mt-3 text-white/50">
            IntentFlow checks policy before payment.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {success}
          </div>
        )}

        {!order && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
            <h2 className="text-xl font-bold">
              Ready to checkout?
            </h2>

            <p className="mt-2 text-sm text-white/50">
              Your cart will be converted into an IntentFlow
              order and evaluated against merchant policy.
            </p>

            <button
              type="button"
              onClick={() => void createCheckoutOrder()}
              disabled={checkoutLoading}
              className="btn-primary mt-6 w-full py-3 disabled:opacity-50"
            >
              {checkoutLoading
                ? "Creating order..."
                : "Create Order"}
            </button>
          </div>
        )}

        {order && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-widest text-white/30">
                    Order
                  </p>

                  <h2 className="mt-1 text-xl font-bold">
                    #{order.id}
                  </h2>
                </div>

                <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs text-violet-300">
                  {order.status}
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border-b border-white/[0.06] pb-3"
                  >
                    <div>
                      <p className="font-medium">
                        {item.productName}
                      </p>

                      <p className="text-xs text-white/40">
                        Qty: {item.quantity}
                      </p>
                    </div>

                    <p className="font-semibold">
                      ₹
                      {(
                        item.unitPrice * item.quantity
                      ).toLocaleString("en-IN")}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between">
                <span className="text-white/50">
                  Total
                </span>

                <span className="text-3xl font-black">
                  ₹{order.totalAmount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {checkoutResult && (
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-6">
                <p className="text-xs uppercase tracking-widest text-violet-400">
                  Policy decision
                </p>

                <h2 className="mt-2 text-xl font-bold">
                  {checkoutResult.policy.decision}
                </h2>

                <p className="mt-3 text-sm leading-relaxed text-white/50">
                  {checkoutResult.policy.reason}
                </p>
              </div>
            )}

            {order.status === "PENDING_APPROVAL" && (
  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] p-6">
    <div className="flex items-start gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-xl">
        ⏳
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-amber-300">
            Merchant approval required
          </h2>

          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Pending approval
          </span>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-amber-100/60">
          This order exceeds your autonomous spending limit.
          Payment will become available once the merchant
          approves the order.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
              Order amount
            </p>

            <p className="mt-1 text-lg font-bold text-white">
              ₹{order.totalAmount.toLocaleString("en-IN")}
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
              Autonomous limit
            </p>

            <p className="mt-1 text-lg font-bold text-white">
              ₹5,000
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
              Payment
            </p>

            <p className="mt-1 text-lg font-bold text-amber-300">
              Waiting
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 text-xs text-white/40">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Waiting for merchant decision
        </div>

        <button
          type="button"
          onClick={() => void loadCartAndOrder({ silent: true })}
          className="mt-4 rounded-lg border border-amber-500/20 px-4 py-2 text-xs text-amber-300 transition hover:bg-amber-500/10"
        >
          Refresh status
        </button>
      </div>
    </div>
  </div>
)}

            {order.status === "APPROVED" && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6">
                <h2 className="font-bold text-emerald-300">
                  Order approved
                </h2>

                <p className="mt-2 text-sm text-emerald-200/60">
                  Your order is approved and ready for Razorpay
                  payment.
                </p>

                <button
                  type="button"
                  onClick={() => void startPayment()}
                  disabled={paymentLoading}
                  className="btn-primary mt-5 w-full py-3 disabled:opacity-50"
                >
                  {paymentLoading
                    ? "Opening payment..."
                    : "Pay with Razorpay"}
                </button>
              </div>
            )}

            {order.status === "PAYMENT_PENDING" && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-6">
                <h2 className="font-bold text-blue-300">
                  Payment pending
                </h2>

                <p className="mt-2 text-sm text-blue-200/60">
                  A Razorpay payment has already been created
                  for this order.
                </p>

                {payment && (
                  <p className="mt-3 text-xs text-white/40">
                    Razorpay Order: {payment.razorpayOrderId}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void startPayment()}
                  disabled={paymentLoading}
                  className="btn-primary mt-5 w-full py-3 disabled:opacity-50"
                >
                  {paymentLoading
                    ? "Opening payment..."
                    : "Continue Razorpay payment"}
                </button>
              </div>
            )}

            {order.status === "CANCELLED" && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
                <h2 className="text-xl font-bold text-red-300">
                  Order cancelled
                </h2>

                <p className="mt-2 text-sm text-red-200/70">
                  {order.policyReason ??
                    "The merchant rejected this order. You can return to shopping and create a new order."}
                </p>
              </div>
            )}

            {order.status === "PAID" && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-6">
                <h2 className="text-xl font-bold text-emerald-300">
                  ✓ Payment successful
                </h2>

                <p className="mt-2 text-sm text-emerald-200/60">
                  Your IntentFlow order has been paid
                  successfully.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <a
                href="/"
                className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-center text-sm text-white/60 hover:text-white"
              >
                Continue shopping
              </a>

              <a
                href="/cart"
                className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-center text-sm text-white/60 hover:text-white"
              >
                View cart
              </a>
            </div>
          </div>
        )}
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-8 text-center text-xs text-white/30">
        IntentFlow · AI proposes · Policy decides · Razorpay
        executes
      </footer>
    </main>
  );
}
