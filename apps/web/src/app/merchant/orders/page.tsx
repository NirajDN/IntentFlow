
"use client";
import BrandIcon from "@/components/BrandIcon";
import { useEffect, useState } from "react";
import {
  apiFetch,
  getStoredUser,
} from "../../../lib/api";

type OrderItem = {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

type PolicyAudit = {
  id: string;
  decision: string;
  reason: string;
  spendLimit: number | null;
  orderAmount: number | null;
  evaluatedAt: string;
};

type Order = {
  id: string;
  userId: string;
  totalAmount: number;
  currency: string;
  status: string;
  policyDecision: string;
  policyReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  policyAudits: PolicyAudit[];
};

type OrdersResponse = Order[];

export default function MerchantOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionOrderId, setActionOrderId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [user, setUser] = useState<ReturnType<typeof getStoredUser>>(null);

  useEffect(() => {
    setUser(getStoredUser());
    void loadOrders();
  }, []);

  async function loadOrders() {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch<OrdersResponse>("/api/orders/merchant");

      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Failed to load orders");
      }

      setOrders(response.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load orders."
      );
    } finally {
      setLoading(false);
    }
  }

  async function approveOrder(orderId: string) {
    setActionOrderId(orderId);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch(
        `/api/orders/${orderId}/approve`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      if (!response.success) {
        throw new Error(
          response.error ?? "Failed to approve order"
        );
      }

      setSuccess("Order approved successfully.");
      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to approve order."
      );
    } finally {
      setActionOrderId(null);
    }
  }

  async function rejectOrder(orderId: string) {
    const reason = window.prompt(
      "Reason for rejecting this order:",
      "Order rejected by merchant."
    );

    if (reason === null) {
      return;
    }

    setActionOrderId(orderId);
    setError("");
    setSuccess("");

    try {
      const response = await apiFetch(
        `/api/orders/${orderId}/reject`,
        {
          method: "POST",
          body: JSON.stringify({
            reason:
              reason.trim() ||
              "Order rejected by merchant.",
          }),
        }
      );

      if (!response.success) {
        throw new Error(
          response.error ?? "Failed to reject order"
        );
      }

      setSuccess("Order rejected.");
      await loadOrders();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to reject order."
      );
    } finally {
      setActionOrderId(null);
    }
  }

  const pendingOrders = orders.filter(
    (order) => order.status === "PENDING_APPROVAL"
  );

  const processedOrders = orders.filter(
    (order) => order.status !== "PENDING_APPROVAL"
  );

  return (
    <main className="min-h-screen bg-[#05050f] text-white">
      {/* Ambient background */}
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

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between border-b border-white/[0.06] px-6 py-5 md:px-12">
        <a href="/merchant" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white transition hover:border-violet-500/30">
            <BrandIcon size={16} />
          </div>

          <span className="text-lg font-bold tracking-tight">
            IntentFlow
          </span>
        </a>

        <div className="flex items-center gap-2">
          <a
            href="/merchant"
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-violet-500/40 hover:text-white"
          >
            Overview
          </a>

          <a
            href="/merchant/orders"
            className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm text-violet-300"
          >
            Orders
          </a>

          <a
            href="/merchant/products"
            className="hidden rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-violet-500/40 hover:text-white sm:block"
          >
            Products
          </a>

          <a
            href="/merchant/inventory"
            className="hidden rounded-xl border border-white/10 px-4 py-2 text-sm text-white/60 transition hover:border-violet-500/40 hover:text-white sm:block"
          >
            Inventory
          </a>
        </div>
      </nav>

      {/* Page */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-12 md:py-16">
        <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              Merchant governance
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">
              Order Approvals
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/45">
              Review orders that exceed your autonomous
              spending policy before payment is allowed.
            </p>

            {user && (
              <p className="mt-3 text-sm text-white/30">
                Signed in as {user.name}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void loadOrders()}
            disabled={loading}
            className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-white/70 transition hover:border-violet-500/30 hover:text-white disabled:opacity-50"
          >
            {loading ? "Refreshing..." : "Refresh Orders"}
          </button>
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

        {/* Pending count */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="glass rounded-2xl p-5">
            <p className="text-xs uppercase tracking-widest text-white/30">
              Pending approval
            </p>

            <p className="mt-2 text-3xl font-black text-amber-300">
              {pendingOrders.length}
            </p>
          </div>

          <div className="glass rounded-2xl p-5">
            <p className="text-xs uppercase tracking-widest text-white/30">
              Approved
            </p>

            <p className="mt-2 text-3xl font-black text-emerald-300">
              {
                orders.filter(
                  (order) => order.status === "APPROVED"
                ).length
              }
            </p>
          </div>

          <div className="glass rounded-2xl p-5">
            <p className="text-xs uppercase tracking-widest text-white/30">
              Total orders
            </p>

            <p className="mt-2 text-3xl font-black">
              {orders.length}
            </p>
          </div>
        </div>

        {/* Pending approvals */}
        <div>
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              Requires your decision
            </p>

            <h2 className="mt-1 text-2xl font-bold">
              Pending Approvals
            </h2>
          </div>

          {loading ? (
            <div className="glass rounded-2xl p-10 text-center text-white/40">
              Loading orders...
            </div>
          ) : pendingOrders.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center">
              <div className="text-4xl">✓</div>

              <h3 className="mt-4 text-xl font-bold">
                No pending approvals
              </h3>

              <p className="mt-2 text-sm text-white/40">
                New orders requiring merchant approval
                will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {pendingOrders.map((order) => {
                const isProcessing =
                  actionOrderId === order.id;

                return (
                  <article
                    key={order.id}
                    className="glass rounded-2xl p-6"
                  >
                    <div className="flex flex-col justify-between gap-5 lg:flex-row">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                            PENDING APPROVAL
                          </span>

                          <span className="text-xs text-white/30">
                            Order #{order.id}
                          </span>
                        </div>

                        <h3 className="mt-4 text-xl font-bold">
                          {order.items.length === 1
                            ? order.items[0]?.productName
                            : `${order.items.length} products`}
                        </h3>

                        <div className="mt-4 space-y-2">
                          {order.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 text-sm"
                            >
                              <span className="text-white/65">
                                {item.productName}
                              </span>

                              <span className="text-white/40">
                                × {item.quantity}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-5 rounded-xl border border-amber-500/15 bg-amber-500/[0.05] p-4">
                          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                            Policy decision
                          </p>

                          <p className="mt-2 text-sm leading-relaxed text-white/60">
                            {order.policyReason ??
                              "This order requires merchant approval."}
                          </p>
                        </div>
                      </div>

                      <div className="flex min-w-[260px] flex-col justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] p-5">
                        <div>
                          <p className="text-xs uppercase tracking-widest text-white/30">
                            Order amount
                          </p>

                          <p className="mt-2 text-4xl font-black">
                            ₹
                            {order.totalAmount.toLocaleString(
                              "en-IN"
                            )}
                          </p>

                          <p className="mt-2 text-xs text-white/30">
                            Created{" "}
                            {new Date(
                              order.createdAt
                            ).toLocaleString("en-IN")}
                          </p>
                        </div>

                        <div className="mt-6 space-y-3">
                          <button
                            type="button"
                            onClick={() =>
                              void approveOrder(order.id)
                            }
                            disabled={isProcessing}
                            className="w-full rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:opacity-50"
                          >
                            {isProcessing
                              ? "Processing..."
                              : "Approve Order"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void rejectOrder(order.id)
                            }
                            disabled={isProcessing}
                            className="w-full rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            Reject Order
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Previous orders */}
        {processedOrders.length > 0 && (
          <div className="mt-14">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
                History
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                Processed Orders
              </h2>
            </div>

            <div className="space-y-3">
              {processedOrders.map((order) => (
                <div
                  key={order.id}
                  className="glass flex flex-col justify-between gap-4 rounded-2xl p-5 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold">
                        {order.items[0]?.productName ??
                          "Order"}
                      </span>

                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          order.status === "APPROVED"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : order.status === "PAID"
                              ? "bg-cyan-500/10 text-cyan-300"
                              : "bg-red-500/10 text-red-300"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-white/30">
                      {order.id}
                    </p>
                  </div>

                  <p className="text-xl font-bold">
                    ₹
                    {order.totalAmount.toLocaleString(
                      "en-IN"
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-8 text-center text-xs text-white/30">
        IntentFlow · AI proposes · Policy decides ·
        Merchant approves · Razorpay executes
      </footer>
    </main>
  );
}

