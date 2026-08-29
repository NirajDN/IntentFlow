"use client";
import BrandIcon from "@/components/BrandIcon";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getStoredToken, getStoredUser } from "@/lib/api";
import type { CategoryDTO, CreateProductInput, ProductDTO } from "@intentflow/shared";

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [initialStock, setInitialStock] = useState("10");
  const [sku, setSku] = useState("");
  const [tags, setTags] = useState("");
  const [deliveryInfo, setDeliveryInfo] = useState("Standard 2-4 days express delivery");
  const [returnPolicy, setReturnPolicy] = useState("7-day policy for defective units");
  const [specKey, setSpecKey] = useState("");
  const [specVal, setSpecVal] = useState("");
  const [specs, setSpecs] = useState<Record<string, string>>({});

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();

    if (!token || !user || user.role !== "MERCHANT") {
      router.push("/login");
      return;
    }

    const fetchCategories = async () => {
      try {
        const res = await apiFetch<CategoryDTO[]>("/api/categories");
        if (res.success && res.data) {
          setCategories(res.data);
        }
      } catch {
        // ignore
      }
    };

    fetchCategories();
  }, [router]);

  const handleAddSpec = () => {
    if (specKey.trim() && specVal.trim()) {
      setSpecs((prev) => ({ ...prev, [specKey.trim()]: specVal.trim() }));
      setSpecKey("");
      setSpecVal("");
    }
  };

  const handleRemoveSpec = (key: string) => {
    setSpecs((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError("Please enter a valid non-negative price.");
      setLoading(false);
      return;
    }

    const stockNum = parseInt(initialStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setError("Please enter a valid non-negative stock count.");
      setLoading(false);
      return;
    }

    const payload: CreateProductInput = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      categoryId: categoryId || undefined,
      categoryName: !categoryId && categoryName.trim() ? categoryName.trim() : undefined,
      brand: brand.trim() || undefined,
      description: description.trim() || undefined,
      price: priceNum,
      currency: currency.trim(),
      initialStock: stockNum,
      sku: sku.trim() || undefined,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
      deliveryInfo: deliveryInfo.trim() || undefined,
      returnPolicy: returnPolicy.trim() || undefined,
      specifications: specs,
      isActive: true,
    };

    try {
      const res = await apiFetch<ProductDTO>("/api/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!res.success || !res.data) {
        setError(res.error || "Failed to create product");
        setLoading(false);
        return;
      }

      router.push("/merchant/products");
    } catch {
      setError("Failed to create product. Check server connection.");
      setLoading(false);
    }
  };

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
          <div className="flex items-center gap-2 text-xs text-[#8080a8]">
            <Link href="/merchant/products" className="hover:text-white">Catalog</Link>
            <span>/</span>
            <span className="text-white font-medium">New Product</span>
          </div>
        </div>
      </header>

      {/* ── Main Form ── */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8 md:px-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Create New Product</h1>
          <p className="text-xs text-[#8080a8] mt-1">
            Add an item to your catalog. AI buyer agents will be able to query and purchase this product within policy bounds.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="glass p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="text-sm font-bold text-violet-300 uppercase tracking-wider">General Information</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Wireless Pro Earbuds"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  Slug (Optional)
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="Auto-generated from name if blank"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  Brand Name
                </label>
                <input
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Sony, Apple, Acme"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0c0c1a] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none mb-2"
                >
                  <option value="">Select Existing Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {!categoryId && (
                  <input
                    type="text"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="Or type a new category name..."
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                  />
                )}
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
                placeholder="Detailed specifications, features, and target use cases..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Pricing & Stock */}
          <div className="glass p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="text-sm font-bold text-violet-300 uppercase tracking-wider">Pricing &amp; Inventory</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  Unit Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="2999"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#0c0c1a] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  Initial Stock
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  placeholder="50"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                  SKU (Unique Code)
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase().replace(/\s+/g, "-"))}
                  placeholder="PROD-EAR-01"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none font-mono"
                />
              </div>
            </div>
          </div>

          {/* Specifications Builder */}
          <div className="glass p-6 rounded-2xl border border-white/10 space-y-4">
            <h2 className="text-sm font-bold text-violet-300 uppercase tracking-wider">Specifications (JSON)</h2>
            <div className="flex flex-wrap gap-2 mb-2">
              {Object.entries(specs).map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-300 font-mono"
                >
                  <span>{k}: {v}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSpec(k)}
                    className="hover:text-rose-400 font-bold"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={specKey}
                onChange={(e) => setSpecKey(e.target.value)}
                placeholder="Attribute (e.g. Battery Life)"
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
              />
              <input
                type="text"
                value={specVal}
                onChange={(e) => setSpecVal(e.target.value)}
                placeholder="Value (e.g. 36 hours)"
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddSpec}
                className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-[#e8e8f0] hover:bg-white/[0.1]"
              >
                + Add Spec
              </button>
            </div>
          </div>

          {/* Delivery & Metadata */}
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
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
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
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                Tags (comma separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="audio, bluetooth, anc, premium"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Link
              href="/merchant/products"
              className="rounded-xl border border-white/10 px-5 py-2.5 text-xs font-semibold text-[#c0c0d8] hover:bg-white/[0.04]"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary rounded-xl px-6 py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              {loading ? "Publishing Product..." : "Publish Product"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
