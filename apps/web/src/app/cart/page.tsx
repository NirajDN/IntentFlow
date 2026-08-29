
"use client";

import { useEffect, useState } from "react";
import {
  apiFetch,
  clearStoredSession,
  getStoredUser,
  isActiveOrderStatus,
  selectActiveBuyerOrder,
} from "../../lib/api";
import BrandIcon from "../../components/BrandIcon";

type CartProduct = {
  id: string;
  name: string;
  brand: string | null;
  price: number;
  currency: string;
  imageUrl: string | null;
  deliveryInfo: string | null;
  returnPolicy: string | null;
};

type CartItem = {
  id: string;
  productId: string;
  quantity: number;
  product: CartProduct;
};

type Cart = {
  id: string | null;
  userId: string;
  items: CartItem[];
  totalAmount: number;
  totalItems: number;
};

type CheckoutResponse = {
  order: {
    id: string;
    totalAmount: number;
    currency: string;
    status: string;
    policyDecision: string;
    policyReason: string | null;
    razorpayOrderId: string | null;
  };
  policy: {
    decision: string;
    reason: string;
    spendLimit: number;
    orderAmount: number;
  };
};

type ActiveOrder = {
  id: string;
  status: string;
  totalAmount: number;
  items?: { id: string; productName: string; quantity: number; unitPrice: number }[];
};

export default function CartPage() {
  const [user, setUser] = useState<ReturnType<typeof getStoredUser>>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);

  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);

    if (!storedUser) {
      setLoading(false);
      return;
    }

    void loadCart();
    void loadActiveOrder();
  }, []);

  async function loadActiveOrder() {
    try {
      const response = await apiFetch<ActiveOrder[]>("/api/orders");

      if (!response.success) {
        return;
      }

      const next = selectActiveBuyerOrder(response.data ?? []);
      setActiveOrder(next ?? null);
    } catch {
      // Cart page should still work if order lookup fails.
    }
  }

  async function loadCart() {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch<Cart>("/api/cart");

      if (!response.success) {
        throw new Error(response.error ?? "Failed to load cart");
      }

      if (!response.data) {
        throw new Error("Cart data was not returned");
      }

      setCart(response.data);
    } catch (err) {
      setCart(null);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load cart."
      );
    } finally {
      setLoading(false);
    }
  }

  async function updateQuantity(
    itemId: string,
    quantity: number
  ) {
    if (quantity < 1) return;

    setUpdatingItemId(itemId);
    setError("");
    setMessage("");

    try {
      const response = await apiFetch<CartItem>(
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
          : "Failed to update quantity."
      );
    } finally {
      setUpdatingItemId(null);
    }
  }

  async function removeItem(itemId: string) {
    setRemovingItemId(itemId);
    setError("");
    setMessage("");

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

      setMessage("Item removed from cart.");
      await loadCart();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove item."
      );
    } finally {
      setRemovingItemId(null);
    }
  }

  async function clearCart() {
    setError("");
    setMessage("");

    try {
      const response = await apiFetch("/api/cart", {
        method: "DELETE",
      });

      if (!response.success) {
        throw new Error(
          response.error ?? "Failed to clear cart"
        );
      }

      setMessage("Cart cleared.");
      await loadCart();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to clear cart."
      );
    }
  }

  async function checkout() {
    if (!cart || cart.items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    if (activeOrder && isActiveOrderStatus(activeOrder.status)) {
  setError(
    `You already have an active order (${activeOrder.status}). Complete it before starting a new checkout.`
  );
  return;
}

    setCheckoutLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await apiFetch<CheckoutResponse>(
        "/api/orders/checkout",
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      if (!response.success) {
        if (response.error?.includes("already have an active order")) {
          window.location.href = "/checkout";
          return;
        }

        throw new Error(
          response.error ?? "Checkout failed"
        );
      }

      if (!response.data) {
        throw new Error("Checkout data was not returned");
      }

      window.location.href = "/checkout";
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

  function signOut() {
    clearStoredSession();
    setUser(null);
    window.location.href = "/";
  }

  if (!user && !loading) {
    return (
      <main className="min-h-screen bg-[#05050f] text-white">
        <nav className="border-b border-white/[0.06] px-6 py-5 md:px-12">
          <a
            href="/"
            className="text-lg font-bold tracking-tight"
          >
            IntentFlow
          </a>
        </nav>

        <section className="mx-auto max-w-xl px-6 py-24 text-center">
          <div className="glass rounded-2xl p-10">
            <div className="text-5xl">🛒</div>

            <h1 className="mt-5 text-3xl font-black">
              Sign in to view your cart
            </h1>

            <p className="mt-3 text-sm text-white/40">
              Your cart is connected to your IntentFlow
              buyer account.
            </p>

            <a
              href="/login"
              className="btn-primary mt-7 inline-flex px-8 py-3"
            >
              Sign in
            </a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05050f] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(124,58,237,0.16) 0%, transparent 70%)",
          }}
        />

        <div
          className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)",
          }}
        />
      </div>

      <nav className="relative z-10 flex items-center justify-between border-b border-white/[0.06] px-6 py-5 md:px-12">
        <a
          href="/"
          className="flex items-center gap-3"
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
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
            href="/"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white"
          >
            Shop
          </a>

          <a
            href={user?.role === "MERCHANT" ? "/merchant/orders" : "/orders"}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white"
          >
            Orders
          </a>

          {activeOrder && (
            <a
              href="/checkout"
              className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300"
            >
              Checkout
            </a>
          )}

          <a
            href="/merchant"
            className="hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white sm:block"
          >
            Merchant
          </a>

          {user && (
            <>
              <span className="hidden text-sm text-white/60 md:block">
                {user.name}
              </span>

              <button
                type="button"
                onClick={signOut}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </nav>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-12 md:pt-16">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
            Your shopping cart
          </p>

          <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
            Review your order.
          </h1>

          <p className="mt-3 text-white/40">
            Review your products before IntentFlow
            processes checkout.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {message}
          </div>
        )}

        {loading ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-3xl">⏳</div>
            <p className="mt-4 text-sm text-white/40">
              Loading your cart...
            </p>
          </div>
        ) : error && !cart ? (
          <div className="glass rounded-2xl p-12 text-center">
            <h2 className="text-2xl font-bold">
              Could not load your cart
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-white/40">
              {error}
            </p>

            <button
              type="button"
              onClick={() => void loadCart()}
              className="btn-primary mt-7 inline-flex px-8 py-3"
            >
              Retry
            </button>
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-5xl">🛒</div>

            <h2 className="mt-5 text-2xl font-bold">
              Your cart is empty
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-white/40">
              Search for something you want to buy and
              add it to your cart.
            </p>

            {activeOrder && (
              <a
                href="/checkout"
                className="btn-primary mt-7 inline-flex px-8 py-3"
              >
                Return to current order
              </a>
            )}

            <a
              href="/"
              className={`${
                activeOrder ? "mt-4" : "mt-7"
              } inline-flex rounded-xl border border-white/10 px-8 py-3 text-sm text-white/70 hover:text-white`}
            >
              Continue shopping
            </a>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {cart.items.map((item) => (
                <article
                  key={item.id}
                  className="glass rounded-2xl p-5"
                >
                  <div className="flex gap-5">
                    <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/10 text-4xl">
                      🎧
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-bold">
                            {item.product.name}
                          </h2>

                          {item.product.brand && (
                            <p className="mt-1 text-xs text-white/40">
                              {item.product.brand}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            void removeItem(item.id)
                          }
                          disabled={
                            removingItemId === item.id
                          }
                          className="text-xs text-red-300/70 transition hover:text-red-300 disabled:opacity-50"
                        >
                          {removingItemId === item.id
                            ? "Removing..."
                            : "Remove"}
                        </button>
                      </div>

                      <p className="mt-3 text-xl font-black">
                        ₹
                        {item.product.price.toLocaleString(
                          "en-IN"
                        )}
                      </p>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.03]">
                          <button
                            type="button"
                            onClick={() =>
                              void updateQuantity(
                                item.id,
                                item.quantity - 1
                              )
                            }
                            disabled={
                              item.quantity <= 1 ||
                              updatingItemId === item.id
                            }
                            className="px-4 py-2 text-white/60 transition hover:text-white disabled:opacity-30"
                          >
                            −
                          </button>

                          <span className="min-w-10 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              void updateQuantity(
                                item.id,
                                item.quantity + 1
                              )
                            }
                            disabled={
                              updatingItemId === item.id
                            }
                            className="px-4 py-2 text-white/60 transition hover:text-white disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>

                        <p className="text-lg font-bold">
                          ₹
                          {(
                            item.product.price *
                            item.quantity
                          ).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {item.product.deliveryInfo && (
                    <div className="mt-5 border-t border-white/[0.06] pt-4 text-xs text-white/40">
                      {item.product.deliveryInfo}
                    </div>
                  )}
                </article>
              ))}

              <button
                type="button"
                onClick={() => void clearCart()}
                className="text-sm text-white/40 transition hover:text-red-300"
              >
                Clear cart
              </button>
            </div>

            <aside className="h-fit lg:sticky lg:top-6 space-y-4">
              {/* ── Active order banner ───────────────────────────── */}
              {activeOrder && isActiveOrderStatus(activeOrder.status) && (
                <div className="glass rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                    Existing order
                  </p>

                  {activeOrder.items && activeOrder.items.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {activeOrder.items.map((item) => (
                        <li key={item.id} className="text-sm text-white/70">
                          {item.productName}
                          {item.quantity > 1 && (
                            <span className="text-white/40"> × {item.quantity}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-2 text-xl font-black">
                    ₹{activeOrder.totalAmount.toLocaleString("en-IN")}
                  </p>

                  <span className="mt-1 inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                    {activeOrder.status.replaceAll("_", " ")}
                  </span>

                  <p className="mt-3 text-xs text-amber-200/60">
                    You have an active order pending payment. Complete it before starting a new checkout.
                  </p>

                  <a
                    href="/checkout"
                    className="btn-primary mt-4 flex w-full items-center justify-center py-3 text-sm"
                  >
                    Continue existing payment
                  </a>
                </div>
              )}

              {/* ── Cart summary ──────────────────────────────────── */}
              <div className="glass rounded-2xl p-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
                  {activeOrder && isActiveOrderStatus(activeOrder.status)
                    ? "Current cart"
                    : "Order summary"}
                </p>

                <div className="mt-5 flex items-center justify-between text-sm text-white/50">
                  <span>
                    Items ({cart.totalItems})
                  </span>

                  <span>
                    ₹
                    {cart.totalAmount.toLocaleString(
                      "en-IN"
                    )}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between text-sm text-white/50">
                  <span>Delivery</span>
                  <span className="text-emerald-300">
                    Free
                  </span>
                </div>

                <div className="my-5 border-t border-white/[0.08]" />

                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    Total
                  </span>

                  <span className="text-2xl font-black">
                    ₹
                    {cart.totalAmount.toLocaleString(
                      "en-IN"
                    )}
                  </span>
                </div>

                {activeOrder && isActiveOrderStatus(activeOrder.status) ? (
                  <p className="mt-6 text-center text-xs text-white/30">
                    Complete the existing order above before checking out this cart.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => void checkout()}
                    disabled={checkoutLoading || cart.items.length === 0}
                    className="btn-primary mt-6 w-full py-3 disabled:opacity-50"
                  >
                    {checkoutLoading
                      ? "Processing..."
                      : "Proceed to Checkout"}
                  </button>
                )}

                <p className="mt-4 text-center text-xs leading-relaxed text-white/30">
                  IntentFlow will evaluate the order
                  against the merchant spending policy
                  before payment.
                </p>
              </div>
            </aside>
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
