"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getStoredToken, getStoredUser } from "@/lib/api";
import type { CategoryDTO, ProductDTO } from "@intentflow/shared";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditProductPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const productId = resolvedParams.id;
  const router = useRouter();

  const [product, setProduct] = useState<ProductDTO | null>(null);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Editable Form Fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [isActive, setIsActive] = useState(true);
  const [deliveryInfo, setDeliveryInfo] = useState("");
  const [returnPolicy, setReturnPolicy] = useState("");
  const [tags, setTags] = useState("");

  // Stock Adjustment in edit view
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();

    if (!token || !user || user.role !== "MERCHANT") {
      router.push("/login");
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [catRes, prodRes] = await Promise.all([
          apiFetch<CategoryDTO[]>("/api/categories"),
          apiFetch<ProductDTO>(`/api/products/${productId}`),
        ]);

        if (catRes.success && catRes.data) {
          setCategories(catRes.data);
        }

        if (prodRes.success && prodRes.data) {
          const p = prodRes.data;
          setProduct(p);
          setName(p.name);
          setSlug(p.slug);
          setCategoryId(p.categoryId || "");
          setBrand(p.brand || "");
          setDescription(p.description || "");
          setPrice(p.price.toString());
          setCurrency(p.currency);
          setIsActive(p.isActive);
          setDeliveryInfo(p.deliveryInfo || "");
          setReturnPolicy(p.returnPolicy || "");
          setTags(p.tags?.join(", ") || "");
        } else {
          setError(prodRes.error || "Product not found");
        }
      } catch {
        setError("Failed to load product details.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [productId, router]);

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError("Price must be a non-negative number.");
      setSaving(false);
      return;
    }

    try {
      const res = await apiFetch<ProductDTO>(`/api/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          categoryId: categoryId || null,
          brand: brand.trim() || null,
          description: description.trim() || null,
          price: priceNum,
          currency: currency.trim(),
          isActive,
          deliveryInfo: deliveryInfo.trim() || null,
          returnPolicy: returnPolicy.trim() || null,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t.length > 0),
        }),
      });

      if (!res.success || !res.data) {
        setError(res.error || "Failed to update product");
        return;
      }

      setProduct(res.data);
      setMessage("Product updated successfully!");
    } catch {
      setError("Failed to update product.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(adjustQty, 10);
    if (isNaN(qty) || qty === 0) {
      setError("Please specify a non-zero quantity change.");
      return;
    }
    if (!adjustReason.trim()) {
      setError("Please provide a reason for the stock adjustment.");
      return;
    }

    setAdjustLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await apiFetch(`/api/inventory/${productId}/adjust`, {
        method: "POST",
        body: JSON.stringify({
          quantityChange: qty,
          reason: adjustReason.trim(),
        }),
      });

      if (!res.success) {
        setError(res.error || "Failed to adjust stock");
        return;
      }

      // Refresh product data
      const prodRes = await apiFetch<ProductDTO>(`/api/products/${productId}`);
      if (prodRes.success && prodRes.data) {
        setProduct(prodRes.data);
      }

      setAdjustQty("");
      setAdjustReason("");
      setMessage("Inventory stock successfully adjusted!");
    } catch {
      setError("Failed to adjust inventory.");
    } finally {
      setAdjustLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05050f] text-[#e8e8f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-xs text-[#8080a8]">Loading product configuration...</p>
        </div>
      </div>
    );
  }

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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight">IntentFlow</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-[#8080a8]">
            <Link href="/merchant/products" className="hover:text-white">Catalog</Link>
            <span>/</span>
            <span className="text-white font-medium">{product?.name || "Edit Product"}</span>
          </div>
        </div>
      </header>

      {/* ── Main Form ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 md:px-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{product?.name}</h1>
            <p className="text-xs text-[#8080a8] mt-1 font-mono">ID: {product?.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                isActive
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-400"
              }`}
            >
              {isActive ? "● Active in Catalog" : "○ Inactive / Hidden"}
            </button>
          </div>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Product Form */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleUpdateProduct} className="space-y-6">
              <div className="glass p-6 rounded-2xl border border-white/10 space-y-4">
                <h2 className="text-sm font-bold text-violet-300 uppercase tracking-wider">Product Core Data</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                      Name
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                      Slug
                    </label>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                      Brand
                    </label>
                    <input
                      type="text"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                      Category
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#0c0c1a] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                      Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#0c0c1a] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Delivery & Return Policy */}
              <div className="glass p-6 rounded-2xl border border-white/10 space-y-4">
                <h2 className="text-sm font-bold text-violet-300 uppercase tracking-wider">Fulfillment &amp; Policy</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                      Delivery Info
                    </label>
                    <input
                      type="text"
                      value={deliveryInfo}
                      onChange={(e) => setDeliveryInfo(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                      Return Policy
                    </label>
                    <input
                      type="text"
                      value={returnPolicy}
                      onChange={(e) => setReturnPolicy(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                    Tags
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Link
                  href="/merchant/products"
                  className="rounded-xl border border-white/10 px-5 py-2 text-xs font-semibold text-[#c0c0d8]"
                >
                  Back
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary rounded-xl px-6 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {saving ? "Saving Changes..." : "Save Product Details"}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Inventory & Stock Adjustments */}
          <div className="space-y-6">
            {/* Current Stock Summary */}
            <div className="glass p-6 rounded-2xl border border-white/10">
              <h2 className="text-sm font-bold text-[#a0a0c0] uppercase tracking-wider mb-4">Live Inventory State</h2>
              <div className="grid grid-cols-3 gap-2 text-center mb-6">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10">
                  <div className="text-xl font-bold text-emerald-400">{product?.inventory?.availableQuantity ?? 0}</div>
                  <div className="text-[10px] text-[#7070a0] uppercase mt-1">Available</div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10">
                  <div className="text-xl font-bold text-amber-400">{product?.inventory?.reservedQuantity ?? 0}</div>
                  <div className="text-[10px] text-[#7070a0] uppercase mt-1">Reserved</div>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10">
                  <div className="text-xl font-bold text-violet-300">{product?.inventory?.soldQuantity ?? 0}</div>
                  <div className="text-[10px] text-[#7070a0] uppercase mt-1">Sold</div>
                </div>
              </div>

              {/* Adjust Stock Form */}
              <form onSubmit={handleAdjustStock} className="space-y-3 pt-4 border-t border-white/10">
                <h3 className="text-xs font-bold text-violet-300">Quick Stock Adjustment</h3>
                <div>
                  <label className="block text-[11px] text-[#8080a8] mb-1">
                    Quantity Change (+ to add, - to reduce)
                  </label>
                  <input
                    type="number"
                    required
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    placeholder="+20 or -5"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#8080a8] mb-1">Reason / Note</label>
                  <input
                    type="text"
                    required
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Supplier restock batch"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="w-full rounded-xl border border-violet-500/30 bg-violet-500/20 py-2 text-xs font-semibold text-violet-300 hover:bg-violet-500/30 transition-all disabled:opacity-50"
                >
                  {adjustLoading ? "Applying..." : "Apply Adjustment"}
                </button>
              </form>
            </div>

            {/* Recent Adjustments Log */}
            {product?.inventory?.adjustments && product.inventory.adjustments.length > 0 && (
              <div className="glass p-6 rounded-2xl border border-white/10">
                <h3 className="text-xs font-bold text-[#a0a0c0] uppercase tracking-wider mb-3">
                  Adjustment History
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
                  {product.inventory.adjustments.map((adj) => (
                    <div key={adj.id} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                      <div>
                        <div className="text-[#c0c0d8] font-medium">{adj.reason}</div>
                        <div className="text-[10px] text-[#606080]">
                          {new Date(adj.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span
                        className={`font-mono font-bold text-xs ${
                          adj.quantityChange > 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {adj.quantityChange > 0 ? `+${adj.quantityChange}` : adj.quantityChange}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
