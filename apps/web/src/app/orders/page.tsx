"use client";

import { useEffect, useState } from "react";
import {
  apiFetch,
  clearStoredSession,
  getStoredToken,
  getStoredUser,
  isActiveOrderStatus,
} from "../../lib/api";

type OrderItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type Order = {
  id: string;
  totalAmount: number;
  currency: string;
  status: string;
  policyDecision: string;
  policyReason: string | null;
  razorpayOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Waiting for approval",
  APPROVED: "Ready for payment",
  PAYMENT_PENDING: "Payment in progress",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  FAILED: "Failed",
};

const STATUS_STYLES: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-500/10 border-amber-500/20 text-amber-300",
  APPROVED: "bg-violet-500/10 border-violet-500/20 text-violet-300",
  PAYMENT_PENDING: "bg-cyan-500/10 border-cyan-500/20 text-cyan-300",
  PAID: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
  CANCELLED: "bg-red-500/10 border-red-500/20 text-red-300",
  FAILED: "bg-white/[0.06] border-white/10 text-white/50",
};

export default function OrdersPage() {
  const [user, setUser] = useState<ReturnType<typeof getStoredUser>>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedUser = getStoredUser();
    const token = getStoredToken();
    setUser(storedUser);

    if (!storedUser || !token) {
      window.location.href = "/login";
      return;
    }

    void loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<Order[]>("/api/orders");
      if (!response.success) {
        throw new Error(response.error ?? "Failed to load orders");
      }
      setOrders(response.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }

  function signOut() {
    clearStoredSession();
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-[#05050f] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,58,237,0.16) 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)" }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between border-b border-white/[0.06] px-6 py-5 md:px-12">
        <a href="/" className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">IntentFlow</span>
        </a>

        <div className="flex items-center gap-3">
          <a href="/" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white">
            Shop
          </a>
          <a href="/cart" className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:border-violet-500/40 hover:text-white">
            Cart
          </a>
          <a href="/orders" className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300">
            Orders
          </a>
          {user && (
            <>
              <span className="hidden text-sm text-white/50 md:block">{user.name}</span>
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

      {/* Page body */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24 pt-12 md:pt-16">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
            Your orders
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Order history</h1>
          <p className="mt-3 text-white/40">
            Track every order from intent to payment.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
            <button
              type="button"
              onClick={() => void loadOrders()}
              className="ml-3 underline text-red-300/70 hover:text-red-300"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-3xl">⏳</div>
            <p className="mt-4 text-sm text-white/40">Loading your orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="text-5xl">📦</div>
            <h2 className="mt-5 text-2xl font-bold">No orders yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/40">
              Search for a product and check out to create your first order.
            </p>
            <a href="/" className="btn-primary mt-7 inline-flex px-8 py-3">
              Start shopping
            </a>
          </div>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => {
              const statusLabel = STATUS_LABELS[order.status] ?? order.status;
              const statusStyle = STATUS_STYLES[order.status] ?? "bg-white/[0.06] border-white/10 text-white/50";
              const isActive = isActiveOrderStatus(order.status);

              return (
                <article key={order.id} className="glass rounded-2xl p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle}`}>
                          {statusLabel}
                        </span>
                        <span className="text-xs text-white/30 font-mono truncate">
                          #{order.id}
                        </span>
                        <span className="text-xs text-white/25">
                          {new Date(order.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      {/* Order items */}
                      <div className="space-y-2">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-2.5 text-sm"
                          >
                            <span className="text-white/75 font-medium">{item.productName}</span>
                            <div className="flex items-center gap-4 shrink-0">
                              <span className="text-white/40 text-xs">× {item.quantity}</span>
                              <span className="font-semibold text-white/80">
                                ₹{(item.unitPrice * item.quantity).toLocaleString("en-IN")}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Policy reason if cancelled */}
                      {order.status === "CANCELLED" && order.policyReason && (
                        <p className="mt-3 text-xs text-red-300/70 italic">{order.policyReason}</p>
                      )}

                      {order.status === "PENDING_APPROVAL" && (
                        <p className="mt-3 text-xs text-amber-300/70">
                          Waiting for merchant approval before payment is available.
                        </p>
                      )}
                    </div>

                    {/* Right — total + action */}
                    <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 sm:min-w-[140px]">
                      <p className="text-2xl font-black">
                        ₹{order.totalAmount.toLocaleString("en-IN")}
                      </p>

                      {(order.status === "PAYMENT_PENDING" || order.status === "APPROVED") && (
                        <a
                          href="/checkout"
                          className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-300 hover:bg-violet-500/20 transition whitespace-nowrap"
                        >
                          {order.status === "PAYMENT_PENDING" ? "Continue payment" : "Pay now"}
                        </a>
                      )}

                      {order.status === "PAID" && (
                        <span className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
                          ✓ Paid
                        </span>
                      )}

                      {!isActive && order.status !== "PAID" && (
                        <span className="text-xs text-white/25">No action required</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex justify-center gap-4">
          <a href="/" className="rounded-xl border border-white/10 px-6 py-3 text-sm text-white/60 hover:text-white">
            Continue shopping
          </a>
          <a href="/cart" className="rounded-xl border border-white/10 px-6 py-3 text-sm text-white/60 hover:text-white">
            View cart
          </a>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-8 text-center text-xs text-white/30">
        IntentFlow · AI proposes · Policy decides · Razorpay executes
      </footer>
    </main>
  );
}
