"use client";
import BrandIcon from "@/components/BrandIcon";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getStoredToken, getStoredUser, clearStoredSession } from "@/lib/api";
import type { InventoryDTO } from "@intentflow/shared";

interface ExtendedInventory extends InventoryDTO {
  product?: {
    id: string;
    name: string;
    slug: string;
    brand: string | null;
    price: number;
    currency: string;
    isActive: boolean;
  };
}

export default function MerchantInventoryPage() {
  const router = useRouter();
  const [inventories, setInventories] = useState<ExtendedInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Quick Adjustment Modal State
  const [selectedInventory, setSelectedInventory] = useState<ExtendedInventory | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  const fetchInventories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ExtendedInventory[]>("/api/inventory");
      if (res.success && res.data) {
        setInventories(res.data);
      } else {
        setError(res.error || "Failed to load inventory records");
      }
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();

    if (!token || !user || user.role !== "MERCHANT") {
      router.push("/login");
      return;
    }

    fetchInventories();
  }, [router]);

  const handleApplyAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventory) return;

    const qty = parseInt(adjustQty, 10);
    if (isNaN(qty) || qty === 0) {
      setError("Please enter a non-zero quantity change.");
      return;
    }
    if (!adjustReason.trim()) {
      setError("Please provide an adjustment reason.");
      return;
    }

    setAdjustLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await apiFetch(`/api/inventory/${selectedInventory.productId}/adjust`, {
        method: "POST",
        body: JSON.stringify({
          quantityChange: qty,
          reason: adjustReason.trim(),
        }),
      });

      if (!res.success) {
        setError(res.error || "Failed to adjust inventory");
        return;
      }

      setMessage(`Adjusted stock for ${selectedInventory.product?.name || "product"}`);
      setSelectedInventory(null);
      setAdjustQty("");
      setAdjustReason("");
      fetchInventories();
    } catch {
      setError("Failed to execute stock adjustment.");
    } finally {
      setAdjustLoading(false);
    }
  };

  // Metrics calculation
  const totalAvailable = inventories.reduce((sum, item) => sum + item.availableQuantity, 0);
  const totalReserved = inventories.reduce((sum, item) => sum + item.reservedQuantity, 0);
  const totalSold = inventories.reduce((sum, item) => sum + item.soldQuantity, 0);
  const totalInventoryValue = inventories.reduce(
    (sum, item) => sum + item.availableQuantity * (item.product?.price ?? 0),
    0
  );

  return (
    <div className="noise min-h-screen bg-[#05050f] text-[#e8e8f0] flex flex-col">
      {/* ── Top Bar ── */}
      <header className="border-b border-white/[0.08] bg-[#05050f]/80 backdrop-blur-md px-6 py-4 md:px-12 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
              }}
            >
              <BrandIcon size={16} />
            </div>
            <span className="text-base font-bold tracking-tight">IntentFlow</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
            <Link
              href="/merchant"
              className="px-3 py-1.5 rounded-lg text-[#8080a8] hover:text-white hover:bg-white/[0.04] transition-all"
            >
              Overview &amp; Policy
            </Link>
            <Link
              href="/merchant/orders"
              className="px-3 py-1.5 rounded-lg text-[#8080a8] hover:text-white hover:bg-white/[0.04] transition-all"
            >
              Orders
            </Link>
            <Link
              href="/merchant/products"
              className="px-3 py-1.5 rounded-lg text-[#8080a8] hover:text-white hover:bg-white/[0.04] transition-all"
            >
              Product Catalog
            </Link>
            <Link
              href="/merchant/inventory"
              className="px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/20"
            >
              Inventory Management
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              clearStoredSession();
              router.push("/login");
            }}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[#c0c0d8] hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 transition-all"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 md:px-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Inventory &amp; Stock Ledger</h1>
          <p className="text-xs text-[#8080a8] mt-1">
            Authoritative inventory tracking with audit trails. Real-time availability checked by policy engines before agent execution.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-300">
            {message}
          </div>
        )}

        {/* ── Metric Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-xs text-[#7070a0] uppercase tracking-wider font-semibold">Available Units</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-2">
              {totalAvailable.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#505070] mt-1">Ready for autonomous order</div>
          </div>

          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-xs text-[#7070a0] uppercase tracking-wider font-semibold">Reserved in Flight</div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-2">
              {totalReserved.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#505070] mt-1">Pending payment settlement</div>
          </div>

          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-xs text-[#7070a0] uppercase tracking-wider font-semibold">Settled / Sold</div>
            <div className="text-2xl font-bold font-mono text-violet-300 mt-2">
              {totalSold.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#505070] mt-1">Executed via Razorpay</div>
          </div>

          <div className="glass p-5 rounded-2xl border border-white/10">
            <div className="text-xs text-[#7070a0] uppercase tracking-wider font-semibold">Total Stock Value</div>
            <div className="text-2xl font-bold font-mono text-cyan-300 mt-2">
              ₹{totalInventoryValue.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] text-[#505070] mt-1">Available valuation</div>
          </div>
        </div>

        {/* ── Inventory Ledger Table ── */}
        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Stock Allocation per Product</h2>
            <Link
              href="/merchant/products/new"
              className="text-xs text-violet-400 hover:text-violet-300 font-medium"
            >
              + Create Product Stock
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] bg-white/[0.02] text-[#8080a8] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-3.5">Product</th>
                  <th className="px-4 py-3.5">Price</th>
                  <th className="px-4 py-3.5 text-center">Available</th>
                  <th className="px-4 py-3.5 text-center">Reserved</th>
                  <th className="px-4 py-3.5 text-center">Sold</th>
                  <th className="px-4 py-3.5 text-center">Total Lifetime</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#7070a0]">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border border-violet-500 border-t-transparent" />
                        Loading inventory ledger...
                      </div>
                    </td>
                  </tr>
                ) : inventories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-[#7070a0]">
                      No inventory records found. Create products to populate stock.
                    </td>
                  </tr>
                ) : (
                  inventories.map((inv) => (
                    <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-[#e8e8f0]">
                          {inv.product?.name || "Unknown Product"}
                        </div>
                        <div className="text-[11px] text-[#7070a0] mt-0.5">
                          {inv.product?.brand && <span>{inv.product.brand} · </span>}
                          <span className="font-mono text-[10px] text-[#505070]">
                            prod-id: {inv.productId.substring(0, 12)}...
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-mono font-medium text-violet-300">
                        {inv.product?.currency} {inv.product?.price.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-4 text-center font-mono">
                        <span
                          className={`font-bold px-2 py-0.5 rounded-md ${
                            inv.availableQuantity > 10
                              ? "bg-emerald-500/10 text-emerald-400"
                              : inv.availableQuantity > 0
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-rose-500/10 text-rose-400"
                          }`}
                        >
                          {inv.availableQuantity}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center font-mono text-amber-300">
                        {inv.reservedQuantity}
                      </td>
                      <td className="px-4 py-4 text-center font-mono text-[#a0a0c0]">
                        {inv.soldQuantity}
                      </td>
                      <td className="px-4 py-4 text-center font-mono text-[#7070a0]">
                        {inv.availableQuantity + inv.reservedQuantity + inv.soldQuantity}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedInventory(inv);
                            setAdjustQty("");
                            setAdjustReason("");
                          }}
                          className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/20 transition-all"
                        >
                          Adjust Stock
                        </button>
                        <Link
                          href={`/merchant/products/${inv.productId}`}
                          className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-[#c0c0d8] hover:border-violet-500/40 hover:text-white transition-all inline-block"
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ── Quick Adjustment Modal ── */}
      {selectedInventory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="glass w-full max-w-md p-6 rounded-2xl border border-white/10 bg-[#0c0c1a] shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold">Adjust Inventory Stock</h2>
                <p className="text-xs text-[#8080a8] mt-0.5">{selectedInventory.product?.name}</p>
              </div>
              <button
                onClick={() => setSelectedInventory(null)}
                className="text-[#8080a8] hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/10 flex justify-between text-xs font-mono">
              <span className="text-[#8080a8]">Current Available:</span>
              <span className="font-bold text-emerald-400">
                {selectedInventory.availableQuantity} units
              </span>
            </div>

            <form onSubmit={handleApplyAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  Quantity Delta (+ to increase, - to decrease)
                </label>
                <input
                  type="number"
                  required
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder="+50 or -10"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  Adjustment Reason / Audit Trail Note
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Warehouse restock batch #402"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedInventory(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-[#c0c0d8]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="btn-primary rounded-xl px-5 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {adjustLoading ? "Saving..." : "Commit Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
