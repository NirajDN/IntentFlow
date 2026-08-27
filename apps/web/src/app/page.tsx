
"use client";

import { useEffect, useState } from "react";
import {
  apiFetch,
  clearStoredSession,
  getStoredToken,
  getStoredUser,
} from "../lib/api";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Product = {
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
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  inventory: {
    availableQuantity: number;
    reservedQuantity: number;
    soldQuantity: number;
  } | null;
};

type SearchResult = {
  product: Product;
  relevanceScore: number;
  semanticScore: number;
  matchedReasons: string[];
};

type IntentResponse = {
  intent: {
    query: string;
    category?: string;
    maxPrice?: number;
    minPrice?: number;
    inStockOnly?: boolean;
  };
  results: {
    items: SearchResult[];
    total: number;
    semanticEnabled: boolean;
  };
};

type CartItem = {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  product: Product;
};

type Cart = {
  id: string | null;
  userId: string;
  items: CartItem[];
  totalAmount: number;
  totalItems: number;
};

type Order = {
  id: string;
  userId: string;
  totalAmount: number;
  currency: string;
  status:
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "CANCELLED"
  | "FAILED";
  policyDecision: "AUTO_APPROVED" | "REQUIRES_APPROVAL" | "REJECTED";
  policyReason: string | null;
  razorpayOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

type CheckoutResponse = {
  order: Order;
  policy: {
    decision: "AUTO_APPROVED" | "REQUIRES_APPROVAL";
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

type VerifyPaymentResponse = {
  order: Order;
  payment: {
    id: string;
    status: string;
    razorpayOrderId: string | null;
    razorpayPaymentId: string | null;
    razorpaySignature: string | null;
  };
  message: string;
};

type RazorpayOptions = {
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
    color?: string;
  };
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal?: {
    ondismiss?: () => void;
  };
};

type RazorpayInstance = {
  open: () => void;
};

type RazorpayConstructor = new (options: {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: {
    name?: string;
    email?: string;
  };
  theme?: {
    color?: string;
  };
  modal?: {
    ondismiss?: () => void;
  };
}) => {
  open: () => void;
};

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const examples = [
  "wireless headphones under 5000",
  "gaming headset with good microphone under 8000",
  "noise cancelling headphones",
];

export default function HomePage() {
  const [user, setUser] = useState<
    ReturnType<typeof getStoredUser>
  >(null);

  const [message, setMessage] = useState("");
  const [data, setData] = useState<IntentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [cart, setCart] = useState<Cart | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [currentOrder, setCurrentOrder] = useState<Order | null>(
    null
  );

  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

useEffect(() => {
  setUser(getStoredUser());

  if (getStoredToken()) {
    void loadCart();
  }

  const savedQuery = localStorage.getItem("intentflow_last_search");

  if (savedQuery) {
    setMessage(savedQuery);
    void searchIntent(savedQuery);
  }
}, []);
  async function loadCart() {
    if (!getStoredToken()) {
      setCart(null);
      return;
    }

    try {
      const response = await apiFetch<Cart>("/api/cart");

      if (response.success && response.data) {
        setCart(response.data);
      }
    } catch {
      // Cart loading failure should not prevent product search.
    }
  }

  async function searchIntent(query: string) {
    const trimmed = query.trim();

    if (!trimmed) {
      setError("Tell me what you're looking for.");
      return;
    }
    localStorage.setItem("intentflow_last_search", trimmed);

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/search/intent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: trimmed,
          }),
        }
      );

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error ?? "Search failed");
      }

      setData(json.data);
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while searching."
      );
    } finally {
      setLoading(false);
    }
  }

  async function addToCart(productId: string) {
    if (!getStoredToken()) {
      setError("Please sign in before adding items to your cart.");
      return;
    }

    setCartLoading(true);
    setError("");

    try {
      const response = await apiFetch<CartItem>(
        "/api/cart/items",
        {
          method: "POST",
          body: JSON.stringify({
            productId,
            quantity: 1,
          }),
        }
      );

      if (!response.success) {
        throw new Error(
          response.error ?? "Failed to add product to cart"
        );
      }

      await loadCart();
      setCartOpen(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add product to cart."
      );
    } finally {
      setCartLoading(false);
    }
  }

  async function removeCartItem(itemId: string) {
    setCartLoading(true);
    setError("");

    try {
      const response = await apiFetch(
        `/api/cart/items/${itemId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.success) {
        throw new Error(
          response.error ?? "Failed to remove item"
        );
      }

      await loadCart();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove cart item."
      );
    } finally {
      setCartLoading(false);
    }
  }

  async function updateCartQuantity(
    itemId: string,
    quantity: number
  ) {
    if (quantity < 1) {
      await removeCartItem(itemId);
      return;
    }

    setCartLoading(true);
    setError("");

    try {
      const response = await apiFetch(
        `/api/cart/items/${itemId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            quantity,
          }),
        }
      );

      if (!response.success) {
        throw new Error(
          response.error ?? "Failed to update quantity"
        );
      }

      await loadCart();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update cart."
      );
    } finally {
      setCartLoading(false);
    }
  }

  async function checkout() {
    if (!getStoredToken()) {
      setError("Please sign in before checking out.");
      return;
    }

    if (!cart || cart.items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    setCheckoutLoading(true);
    setCheckoutMessage("");
    setPaymentMessage("");
    setError("");

    try {
      const response = await apiFetch<CheckoutResponse>(
        "/api/orders/checkout",
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      if (!response.success || !response.data) {
        throw new Error(
          response.error ?? "Checkout failed"
        );
      }

      const checkoutData = response.data;

      setCurrentOrder(checkoutData.order);
      setCartOpen(false);

      if (
        checkoutData.policy.decision === "REQUIRES_APPROVAL"
      ) {
        setCheckoutMessage(
          `Order created. Merchant approval is required because the order amount of ₹${checkoutData.policy.orderAmount.toLocaleString(
            "en-IN"
          )} exceeds the autonomous spend limit of ₹${checkoutData.policy.spendLimit.toLocaleString(
            "en-IN"
          )}.`
        );
      } else {
        setCheckoutMessage(
          "Order approved automatically. You can proceed to payment."
        );
      }

      await loadCart();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Checkout failed."
      );
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function refreshOrder() {
    if (!currentOrder) {
      return;
    }

    try {
      const response = await apiFetch<Order>(
        `/api/orders/${currentOrder.id}`
      );

      if (!response.success || !response.data) {
        throw new Error(
          response.error ?? "Failed to refresh order"
        );
      }

      setCurrentOrder(response.data);

      if (response.data.status === "APPROVED") {
        setCheckoutMessage(
          "Merchant approved your order. You can now proceed to payment."
        );
      }

      if (response.data.status === "PAID") {
        setCheckoutMessage(
          "Payment completed successfully. Your order is paid."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to refresh order."
      );
    }
  }

  async function startPayment() {
    if (!currentOrder) {
      setError("No order is selected for payment.");
      return;
    }

    if (currentOrder.status !== "APPROVED") {
      setError(
        `Order is not ready for payment. Current status: ${currentOrder.status}`
      );
      return;
    }

    setPaymentLoading(true);
    setPaymentMessage("");
    setError("");

    try {
      const response = await apiFetch<PaymentResponse>(
        `/api/orders/${currentOrder.id}/payment`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      if (!response.success || !response.data) {
        throw new Error(
          response.error ?? "Failed to create payment"
        );
      }

      const payment = response.data;

      if (!window.Razorpay) {
        throw new Error(
          "Razorpay Checkout has not loaded yet. Please refresh the page and try again."
        );
      }

      const razorpayKey =
        process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      if (!razorpayKey) {
        throw new Error(
          "NEXT_PUBLIC_RAZORPAY_KEY_ID is not configured in the web app."
        );
      }

      const options: RazorpayOptions = {
        key: razorpayKey,
        amount: payment.amount,
        currency: payment.currency,
        name: "IntentFlow",
        description: "IntentFlow commerce order",
        order_id: payment.razorpayOrderId,
        prefill: {
          name: user?.name ?? undefined,
          email: user?.email ?? undefined,
        },
        theme: {
          color: "#7c3aed",
        },
        handler: (razorpayResponse) => {
          void verifyPayment(
            currentOrder.id,
            razorpayResponse
          );
        },
        modal: {
          ondismiss: () => {
            setPaymentLoading(false);
            setPaymentMessage(
              "Payment window closed. Your order is still awaiting payment."
            );
          },
        },
      };

      const razorpayCheckout = new window.Razorpay(
        options
      );

      razorpayCheckout.open();
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
    orderId: string,
    razorpayResponse: {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    }
  ) {
    setPaymentLoading(true);
    setPaymentMessage("");
    setError("");

    try {
      const response =
        await apiFetch<VerifyPaymentResponse>(
          `/api/orders/${orderId}/payment/verify`,
          {
            method: "POST",
            body: JSON.stringify({
              razorpay_order_id:
                razorpayResponse.razorpay_order_id,
              razorpay_payment_id:
                razorpayResponse.razorpay_payment_id,
              razorpay_signature:
                razorpayResponse.razorpay_signature,
            }),
          }
        );

      if (!response.success || !response.data) {
        throw new Error(
          response.error ?? "Payment verification failed"
        );
      }

      setCurrentOrder(response.data.order);

      setPaymentMessage(
        "Payment successful and verified. Your order is now PAID."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Payment verification failed."
      );
    } finally {
      setPaymentLoading(false);
    }
  }

  function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    void searchIntent(message);
  }

  function signOut() {
    clearStoredSession();
    setUser(null);
    setCart(null);
    setCurrentOrder(null);
    setCartOpen(false);
  }

  const cartCount = cart?.totalItems ?? 0;

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

      <nav className="relative z-20 flex items-center justify-between border-b border-white/[0.06] px-6 py-5 md:px-12">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
            style={{
              background:
                "linear-gradient(135deg, #7c3aed, #4f46e5)",
              boxShadow:
                "0 4px 16px rgba(124,58,237,0.4)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>

          <span className="text-lg font-bold tracking-tight">
            IntentFlow
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/merchant"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white"
          >
            Merchant
          </a>

          {user && (
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white"
            >
              Cart
              {cartCount > 0 && (
                <span className="ml-2 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>
          )}

          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-white/70 sm:inline">
                {user.name}
              </span>

              <button
                type="button"
                onClick={signOut}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white"
              >
                Sign out
              </button>
            </div>
          ) : (
            <a
              href="/login"
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white"
            >
              Sign in
            </a>
          )}
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-16 pt-20 text-center md:pt-28">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-2 text-sm text-violet-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          AI-powered commerce
        </div>

        <h1 className="text-5xl font-black tracking-tight md:text-7xl">
          Tell us what
          <br />
          <span className="gradient-text">
            you want to buy.
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#9090b0]">
          Describe your shopping intent naturally. IntentFlow
          understands your requirements, finds relevant products,
          and ranks them for you.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mx-auto mt-10 max-w-3xl"
        >
          <div className="glass rounded-2xl p-2 shadow-2xl">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={message}
                onChange={(event) =>
                  setMessage(event.target.value)
                }
                placeholder="e.g. wireless headphones under 5000"
                className="min-h-14 flex-1 rounded-xl border border-transparent bg-white/[0.04] px-5 text-base text-white outline-none placeholder:text-white/30 focus:border-violet-500/40"
              />

              <button
                type="submit"
                disabled={loading}
                className="btn-primary min-h-14 min-w-32"
              >
                {loading ? "Thinking..." : "Search"}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setMessage(example);
                void searchIntent(example);
              }}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/50 transition hover:border-violet-500/30 hover:bg-violet-500/10 hover:text-violet-300"
            >
              {example}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {checkoutMessage && (
          <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-4 text-left text-sm text-violet-200">
            <div className="font-semibold">
              Order update
            </div>
            <div className="mt-1 text-violet-200/70">
              {checkoutMessage}
            </div>
          </div>
        )}

        {paymentMessage && (
          <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-left text-sm text-emerald-300">
            {paymentMessage}
          </div>
        )}

        {currentOrder && (
          <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
                  Current order
                </p>

                <p className="mt-1 font-mono text-xs text-white/40">
                  {currentOrder.id}
                </p>

                <p className="mt-3 text-2xl font-black">
                  ₹
                  {currentOrder.totalAmount.toLocaleString(
                    "en-IN"
                  )}
                </p>
              </div>

              <span
                className={`rounded-full px-4 py-2 text-xs font-semibold ${currentOrder.status === "PAID"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : currentOrder.status ===
                      "PENDING_APPROVAL"
                      ? "bg-amber-500/10 text-amber-300"
                      : currentOrder.status === "APPROVED"
                        ? "bg-violet-500/10 text-violet-300"
                        : "bg-white/[0.06] text-white/60"
                  }`}
              >
                {currentOrder.status.replaceAll(
                  "_",
                  " "
                )}
              </span>
            </div>

            {currentOrder.status ===
              "PENDING_APPROVAL" && (
                <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <p className="font-semibold text-amber-300">
                    Merchant approval required
                  </p>

                  <p className="mt-1 text-sm text-amber-200/60">
                    The order exceeds the autonomous spending
                    limit. Ask the merchant to approve this order.
                  </p>

                  <button
                    type="button"
                    onClick={() => void refreshOrder()}
                    className="mt-4 rounded-lg border border-amber-500/20 px-4 py-2 text-xs text-amber-300 transition hover:bg-amber-500/10"
                  >
                    Refresh approval status
                  </button>
                </div>
              )}

            {currentOrder.status === "APPROVED" && (
              <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/10 p-4">
                <p className="font-semibold text-violet-300">
                  Order approved
                </p>

                <p className="mt-1 text-sm text-violet-200/60">
                  Your order is ready for secure Razorpay
                  payment.
                </p>

                <button
                  type="button"
                  onClick={() => void startPayment()}
                  disabled={paymentLoading}
                  className="btn-primary mt-4 w-full sm:w-auto"
                >
                  {paymentLoading
                    ? "Opening payment..."
                    : "Pay with Razorpay"}
                </button>
              </div>
            )}

            {currentOrder.status === "PAYMENT_PENDING" && (
              <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                <p className="font-semibold text-cyan-300">
                  Payment initiated
                </p>

                <p className="mt-1 text-sm text-cyan-200/60">
                  Complete the Razorpay payment to finish
                  your order.
                </p>

                <button
                  type="button"
                  onClick={() => void startPayment()}
                  disabled={paymentLoading}
                  className="btn-primary mt-4 w-full sm:w-auto"
                >
                  {paymentLoading
                    ? "Opening payment..."
                    : "Continue Payment"}
                </button>
              </div>
            )}

            {currentOrder.status === "PAID" && (
              <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <p className="font-semibold text-emerald-300">
                  ✓ Payment completed
                </p>

                <p className="mt-1 text-sm text-emerald-200/60">
                  Razorpay payment was verified successfully
                  and your IntentFlow order is now paid.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {data && (
        <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
          <div className="mb-8 rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
                  Understood intent
                </p>

                <h2 className="mt-2 text-2xl font-bold">
                  {data.intent.query}
                </h2>
              </div>

              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                {data.results.semanticEnabled
                  ? "Semantic search"
                  : "Catalog search"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.intent.category && (
                <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/70">
                  Category: {data.intent.category}
                </span>
              )}

              {data.intent.minPrice !== undefined && (
                <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/70">
                  Min: ₹{data.intent.minPrice}
                </span>
              )}

              {data.intent.maxPrice !== undefined && (
                <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/70">
                  Max: ₹{data.intent.maxPrice}
                </span>
              )}

              {data.intent.inStockOnly && (
                <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/70">
                  In stock
                </span>
              )}
            </div>
          </div>

          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
                Recommended products
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                {data.results.total} result
                {data.results.total === 1 ? "" : "s"}
              </h2>
            </div>
          </div>

          {data.results.items.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2">
              {data.results.items.map((result, index) => (
                <article
                  key={result.product.id}
                  className="glass group rounded-2xl p-5 transition duration-300 hover:-translate-y-1 hover:border-violet-500/30"
                >
                  <div className="flex gap-5">
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/10 text-4xl">
                      🎧
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-start justify-between gap-3">
                        <span className="text-xs font-medium text-violet-400">
                          #{index + 1} recommendation
                        </span>

                        <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-white/40">
                          {(
                            result.relevanceScore * 100
                          ).toFixed(0)}
                          % match
                        </span>
                      </div>

                      <h3 className="text-lg font-bold">
                        {result.product.name}
                      </h3>

                      {result.product.brand && (
                        <p className="mt-1 text-xs text-white/40">
                          {result.product.brand}
                        </p>
                      )}

                      <p className="mt-3 text-2xl font-black">
                        ₹
                        {result.product.price.toLocaleString(
                          "en-IN"
                        )}
                      </p>
                    </div>
                  </div>

                  {result.product.description && (
                    <p className="mt-5 text-sm leading-relaxed text-white/50">
                      {result.product.description}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {result.matchedReasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/50"
                      >
                        ✓ {reason}
                      </span>
                    ))}
                  </div>

                  {result.product.deliveryInfo && (
                    <div className="mt-5 border-t border-white/[0.06] pt-4 text-xs text-white/40">
                      {result.product.deliveryInfo}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      void addToCart(result.product.id)
                    }
                    disabled={cartLoading}
                    className="mt-5 w-full rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-sm font-semibold text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {cartLoading
                      ? "Adding..."
                      : "Add to Cart"}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl p-12 text-center">
              <div className="text-4xl">🔎</div>

              <h3 className="mt-4 text-xl font-bold">
                No matching products
              </h3>

              <p className="mt-2 text-sm text-white/40">
                Try a broader description or remove some
                constraints.
              </p>
            </div>
          )}
        </section>
      )}

      {!data && !loading && (
        <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: "🧠",
                title: "Understand",
                text: "AI extracts what you actually want.",
              },
              {
                icon: "🔎",
                title: "Discover",
                text: "Semantic search finds relevant products.",
              },
              {
                icon: "⚡",
                title: "Rank",
                text: "Products are scored against your intent.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="glass rounded-2xl p-6"
              >
                <div className="text-3xl">{item.icon}</div>

                <h3 className="mt-4 font-bold">
                  {item.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-white/40">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-8 text-center text-xs text-white/30">
        IntentFlow · AI proposes · Policy decides · Razorpay
        executes
      </footer>

      {cartOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close cart"
            onClick={() => setCartOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0a0a18] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-5">
              <div>
                <h2 className="text-xl font-bold">
                  Your Cart
                </h2>

                <p className="mt-1 text-xs text-white/40">
                  {cartCount} item
                  {cartCount === 1 ? "" : "s"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCartOpen(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/50 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {!cart || cart.items.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="text-4xl">🛒</div>

                  <h3 className="mt-4 font-bold">
                    Your cart is empty
                  </h3>

                  <p className="mt-2 text-sm text-white/40">
                    Search for a product and add it to your
                    cart.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
                    >
                      <div className="flex gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-2xl">
                          🎧
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold">
                            {item.product.name}
                          </h3>

                          <p className="mt-1 text-sm text-white/40">
                            ₹
                            {item.product.price.toLocaleString(
                              "en-IN"
                            )}
                          </p>

                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={cartLoading}
                              onClick={() =>
                                void updateCartQuantity(
                                  item.id,
                                  item.quantity - 1
                                )
                              }
                              className="h-7 w-7 rounded-lg border border-white/10 text-white/60 hover:text-white"
                            >
                              −
                            </button>

                            <span className="w-6 text-center text-sm">
                              {item.quantity}
                            </span>

                            <button
                              type="button"
                              disabled={cartLoading}
                              onClick={() =>
                                void updateCartQuantity(
                                  item.id,
                                  item.quantity + 1
                                )
                              }
                              className="h-7 w-7 rounded-lg border border-white/10 text-white/60 hover:text-white"
                            >
                              +
                            </button>

                            <button
                              type="button"
                              disabled={cartLoading}
                              onClick={() =>
                                void removeCartItem(item.id)
                              }
                              className="ml-auto text-xs text-red-400/70 hover:text-red-400"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart && cart.items.length > 0 && (
              <div className="border-t border-white/[0.06] p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/50">
                    Total
                  </span>

                  <span className="text-2xl font-black">
                    ₹
                    {cart.totalAmount.toLocaleString(
                      "en-IN"
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => void checkout()}
                  disabled={checkoutLoading}
                  className="btn-primary mt-5 w-full min-h-12"
                >
                  {checkoutLoading
                    ? "Creating order..."
                    : "Checkout"}
                </button>

                <p className="mt-3 text-center text-[11px] leading-relaxed text-white/30">
                  IntentFlow will evaluate the order against
                  the merchant spending policy before payment.
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

