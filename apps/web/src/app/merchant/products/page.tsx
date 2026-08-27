"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getStoredToken, getStoredUser, clearStoredSession } from "@/lib/api";
import type { ProductDTO, CategoryDTO, ProductPaginatedResponse, CsvImportResult } from "@intentflow/shared";

export default function MerchantProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & pagination
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // CSV Import modal state
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvContent, setCsvContent] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvResult, setCsvResult] = useState<CsvImportResult | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "10");
    if (search.trim()) params.set("search", search.trim());
    if (selectedCategory) params.set("categoryId", selectedCategory);
    if (activeFilter) params.set("isActive", activeFilter);

    try {
      const res = await apiFetch<ProductPaginatedResponse>(`/api/products?${params.toString()}`);
      if (res.success && res.data) {
        setProducts(res.data.items);
        setTotalPages(res.data.totalPages);
        setTotal(res.data.total);
      } else {
        setError(res.error || "Failed to load products");
      }
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedCategory, activeFilter]);

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

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();

    if (!token || !user) {
      router.push("/login");
      return;
    }

    if (user.role !== "MERCHANT") {
      router.push("/");
      return;
    }

    fetchCategories();
    fetchProducts();
  }, [router, fetchProducts]);

  const handleDeactivate = async (id: string, currentStatus: boolean) => {
    try {
      if (currentStatus) {
        // Soft delete/deactivate
        const res = await apiFetch(`/api/products/${id}`, { method: "DELETE" });
        if (res.success) {
          fetchProducts();
        }
      } else {
        // Reactivate
        const res = await apiFetch(`/api/products/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: true }),
        });
        if (res.success) {
          fetchProducts();
        }
      }
    } catch {
      alert("Failed to change product status.");
    }
  };

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setCsvLoading(true);
    setCsvError(null);
    setCsvResult(null);

    try {
      const res = await apiFetch<CsvImportResult>("/api/products/import", {
        method: "POST",
        body: JSON.stringify({ csvContent }),
      });

      if (res.data) {
        setCsvResult(res.data);
        if (res.data.imported > 0) {
          fetchProducts();
        }
      } else {
        setCsvError(res.error || "Failed to import CSV");
      }
    } catch {
      setCsvError("Error communicating with server during CSV import.");
    } finally {
      setCsvLoading(false);
    }
  };

  const sampleCsvTemplate = `name,description,brand,category,price,currency,sku,stock
"Mechanical Keyboard RGB","Tactile mechanical keyboard","KeyChron","Keyboards",6499,INR,"KC-K2-01",50
"Wireless Gaming Mouse","Ultra-lightweight 26K DPI","Razer","Accessories",4999,INR,"RZ-VIP-01",35`;

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
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
            <Link
              href="/merchant"
              className="px-3 py-1.5 rounded-lg text-[#8080a8] hover:text-white hover:bg-white/[0.04] transition-all"
            >
              Overview &amp; Policy
            </Link>
            <Link
              href="/merchant/products"
              className="px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 border border-violet-500/20"
            >
              Product Catalog
            </Link>
            <Link
              href="/merchant/inventory"
              className="px-3 py-1.5 rounded-lg text-[#8080a8] hover:text-white hover:bg-white/[0.04] transition-all"
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
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Merchant Catalog</h1>
            <p className="text-xs text-[#8080a8] mt-1">
              Manage product listings, SKU variants, and price points queried by AI buyer agents.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setCsvContent("");
                setCsvResult(null);
                setCsvError(null);
                setShowCsvModal(true);
              }}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-[#c0c0d8] hover:border-violet-500/40 hover:text-violet-300 transition-all flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import CSV
            </button>
            <Link
              href="/merchant/products/new"
              className="btn-primary rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Product
            </Link>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="glass p-4 rounded-2xl border border-white/10 mb-6 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            <input
              type="text"
              placeholder="Search products by name or brand..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-[#e8e8f0] placeholder-[#606080] focus:border-violet-500 focus:outline-none min-w-[240px]"
            />

            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-white/10 bg-[#0c0c1a] px-3 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={activeFilter}
              onChange={(e) => {
                setActiveFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-white/10 bg-[#0c0c1a] px-3 py-2 text-xs text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="true">Active Only</option>
              <option value="false">Inactive Only</option>
            </select>
          </div>

          <div className="text-xs text-[#7070a0]">
            Total: <span className="font-semibold text-white">{total}</span> items
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Products Table */}
        <div className="glass rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] bg-white/[0.02] text-[#8080a8] uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-3.5">Product &amp; Brand</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Price</th>
                  <th className="px-4 py-3.5">Available Stock</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#7070a0]">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border border-violet-500 border-t-transparent" />
                        Loading products...
                      </div>
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#7070a0]">
                      No products found. Click &quot;Add Product&quot; or &quot;Import CSV&quot; to populate your catalog.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-[#e8e8f0]">{p.name}</div>
                        <div className="text-[11px] text-[#7070a0] flex items-center gap-2 mt-0.5">
                          {p.brand && <span>{p.brand}</span>}
                          <span className="font-mono text-[10px] text-[#505070]">slug: {p.slug}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[#a0a0c0]">
                        {p.category?.name || "Uncategorized"}
                      </td>
                      <td className="px-4 py-4 font-mono font-semibold text-violet-300">
                        {p.currency} {p.price.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-4 font-mono">
                        <span
                          className={`font-semibold ${
                            (p.inventory?.availableQuantity ?? 0) > 10
                              ? "text-emerald-400"
                              : (p.inventory?.availableQuantity ?? 0) > 0
                              ? "text-amber-400"
                              : "text-rose-400"
                          }`}
                        >
                          {p.inventory?.availableQuantity ?? 0}
                        </span>
                        <span className="text-[10px] text-[#606080] ml-1">units</span>
                      </td>
                      <td className="px-4 py-4">
                        {p.isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400">
                            <span className="h-1 w-1 rounded-full bg-emerald-400" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 text-[10px] font-medium text-rose-400">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <Link
                          href={`/merchant/products/${p.id}`}
                          className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-[#c0c0d8] hover:border-violet-500/40 hover:text-white transition-all inline-block"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDeactivate(p.id, p.isActive)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${
                            p.isActive
                              ? "border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                          }`}
                        >
                          {p.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-white/[0.08] px-6 py-3 flex items-center justify-between text-xs text-[#8080a8]">
              <div>
                Page {page} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── CSV Import Modal ── */}
      {showCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="glass w-full max-w-2xl p-6 rounded-2xl border border-white/10 bg-[#0c0c1a] shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Import Products via CSV</h2>
              <button
                onClick={() => setShowCsvModal(false)}
                className="text-[#8080a8] hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#8080a8] mb-3">
              Paste standard CSV rows with columns: <code>name, description, brand, category, price, currency, sku, stock</code>.
            </p>

            <form onSubmit={handleCsvImport} className="space-y-4">
              <textarea
                rows={6}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder={sampleCsvTemplate}
                className="w-full font-mono text-xs rounded-xl border border-white/10 bg-white/[0.04] p-3 text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
              />

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCsvContent(sampleCsvTemplate)}
                  className="text-xs text-violet-400 hover:text-violet-300 underline"
                >
                  Load sample template
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCsvModal(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-[#c0c0d8]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={csvLoading || !csvContent.trim()}
                    className="btn-primary rounded-xl px-5 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {csvLoading ? "Importing..." : "Process CSV"}
                  </button>
                </div>
              </div>
            </form>

            {csvError && (
              <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                {csvError}
              </div>
            )}

            {csvResult && (
              <div className="mt-4 p-4 rounded-xl border border-white/10 bg-white/[0.02] space-y-2 text-xs">
                <div className="flex items-center justify-between font-semibold">
                  <span>Import Summary</span>
                  <span className="text-emerald-400">{csvResult.imported} imported</span>
                </div>
                <div className="text-[#8080a8]">
                  Total processed: {csvResult.total} | Failed: {csvResult.failed}
                </div>
                {csvResult.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto space-y-1 pt-2 border-t border-white/10 text-[11px] text-rose-300">
                    {csvResult.errors.map((err, i) => (
                      <div key={i}>
                        Row {err.row}: {err.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
