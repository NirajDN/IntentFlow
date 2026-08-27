"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getStoredToken, getStoredUser, clearStoredSession } from "@/lib/api";
import type { MerchantDTO, UserPublic } from "@intentflow/shared";

export default function MerchantDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [merchant, setMerchant] = useState<MerchantDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Form fields for creating/updating merchant
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [spendLimit, setSpendLimit] = useState("5000");

  useEffect(() => {
    const token = getStoredToken();
    const storedUser = getStoredUser();

    if (!token || !storedUser) {
      router.push("/login");
      return;
    }

    if (storedUser.role !== "MERCHANT") {
      router.push("/");
      return;
    }

    setUser(storedUser);
    fetchMerchant();
  }, [router]);

  const fetchMerchant = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<MerchantDTO>("/api/merchants/me");
      if (res.success && res.data) {
        setMerchant(res.data);
        setName(res.data.name);
        setSlug(res.data.slug);
        setDescription(res.data.description || "");
        if (res.data.policy) {
          setCurrency(res.data.policy.currency);
          setSpendLimit(res.data.policy.defaultAutonomousSpendLimit.toString());
        }
      }
    } catch {
      setError("Failed to load merchant data.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredSession();
    router.push("/login");
  };

  const handleSaveMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      if (!merchant) {
        // Create new merchant
        const res = await apiFetch<MerchantDTO>("/api/merchants", {
          method: "POST",
          body: JSON.stringify({
            name,
            slug: slug.toLowerCase().trim(),
            description,
          }),
        });

        if (!res.success || !res.data) {
          setError(res.error || "Failed to create merchant profile.");
          return;
        }

        setMerchant(res.data);
        setMessage("Merchant profile created successfully!");
      } else {
        // Update existing merchant
        const res = await apiFetch<MerchantDTO>("/api/merchants/me", {
          method: "PATCH",
          body: JSON.stringify({
            name,
            description,
            currency,
            defaultAutonomousSpendLimit: parseFloat(spendLimit) || 5000,
          }),
        });

        if (!res.success || !res.data) {
          setError(res.error || "Failed to update merchant profile.");
          return;
        }

        setMerchant(res.data);
        setMessage("Merchant profile and policy updated successfully!");
      }
    } catch {
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#05050f] text-[#e8e8f0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-sm text-[#8080a8]">Loading merchant dashboard...</p>
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
          <span className="hidden md:inline-block text-xs font-mono text-[#7070a0]">
            From intent to trusted transaction.
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-[#e8e8f0]">{user?.name}</div>
            <div className="text-[10px] text-violet-400 font-mono">MERCHANT ROLE</div>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[#c0c0d8] hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300 transition-all"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Dashboard Shell ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 md:px-12">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            M2 Merchant Foundation
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Merchant Workspace</h1>
          <p className="text-sm text-[#8080a8] mt-1">
            Configure your storefront identity and policy constraints for autonomous AI agents.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Merchant & Policy Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass p-6 rounded-2xl border border-white/10">
              <h2 className="text-lg font-bold mb-4">
                {merchant ? "Storefront Settings" : "Initialize Merchant Storefront"}
              </h2>

              <form onSubmit={handleSaveMerchant} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                    Store Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Acme Electronics"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-[#e8e8f0] placeholder-[#606080] focus:border-violet-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                    Store Slug
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!merchant}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="acme-electronics"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-[#e8e8f0] placeholder-[#606080] focus:border-violet-500 focus:outline-none disabled:opacity-50"
                  />
                  {merchant && (
                    <p className="text-[11px] text-[#7070a0] mt-1">Slug is permanently locked after creation.</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your catalog, shipping policy, and merchant credentials..."
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-[#e8e8f0] placeholder-[#606080] focus:border-violet-500 focus:outline-none"
                  />
                </div>

                {merchant && (
                  <div className="pt-4 border-t border-white/10">
                    <h3 className="text-sm font-bold text-violet-300 mb-3">Merchant Autonomous Policy (M2)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                          Currency
                        </label>
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-[#0c0c1a] px-4 py-2.5 text-sm text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                        >
                          <option value="INR">INR (₹)</option>
                          <option value="USD">USD ($)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                          Autonomous Spend Limit
                        </label>
                        <input
                          type="number"
                          step="100"
                          value={spendLimit}
                          onChange={(e) => setSpendLimit(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-[#e8e8f0] focus:border-violet-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary py-2.5 px-6 font-medium text-sm mt-2 disabled:opacity-50"
                >
                  {saving ? "Saving..." : merchant ? "Save Storefront Changes" : "Create Storefront"}
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Identity Summary Card */}
          <div className="space-y-6">
            <div className="glass p-6 rounded-2xl border border-white/10">
              <h3 className="text-sm font-bold text-[#a0a0c0] uppercase tracking-wider mb-4">
                Identity & Policy State
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[#606080] block">Merchant ID</span>
                  <span className="font-mono text-[#c0c0d8]">{merchant ? merchant.id : "Not initialized"}</span>
                </div>
                <div>
                  <span className="text-[#606080] block">Owner ID</span>
                  <span className="font-mono text-[#c0c0d8]">{user?.id}</span>
                </div>
                <div>
                  <span className="text-[#606080] block">Policy Status</span>
                  <span className="text-emerald-400 font-medium">
                    {merchant?.policy ? "Active (Auto-provisioned)" : "Pending store creation"}
                  </span>
                </div>
                <div>
                  <span className="text-[#606080] block">Default Autonomous Limit</span>
                  <span className="text-violet-300 font-mono font-bold">
                    {merchant?.policy ? `${merchant.policy.currency} ${merchant.policy.defaultAutonomousSpendLimit}` : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/10 to-indigo-500/10">
              <h4 className="text-sm font-bold text-white mb-2">Policy Governance</h4>
              <p className="text-xs text-[#9090b8] leading-relaxed">
                Transactions below the autonomous spend limit can be negotiated and proposed by AI agents and executed seamlessly via Razorpay once verified by policy gates.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
