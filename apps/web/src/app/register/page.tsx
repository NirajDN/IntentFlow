"use client";
import BrandIcon from "@/components/BrandIcon";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, setStoredSession } from "@/lib/api";
import type { AuthSession, UserRole } from "@intentflow/shared";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("MERCHANT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch<AuthSession>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });

      if (!res.success || !res.data) {
        setError(res.error || "Registration failed.");
        setLoading(false);
        return;
      }

      setStoredSession(res.data);
      setSuccess(true);

      if (res.data.user.role === "MERCHANT") {
        router.push("/merchant");
      } else {
        router.push("/");
      }
    } catch {
      setError("Unable to connect to the registration server.");
      setLoading(false);
    }
  };

  return (
    <div className="noise min-h-screen bg-[#05050f] text-[#e8e8f0] flex flex-col justify-between">
      {/* ── Header ── */}
      <header className="px-6 py-5 md:px-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white transition hover:border-violet-500/30">
           <BrandIcon size={18} />
          </div>
          <span className="text-lg font-bold tracking-tight">IntentFlow</span>
        </Link>
        <span className="text-xs text-[#7070a0] font-mono">
          From intent to trusted transaction.
        </span>
      </header>

      {/* ── Form Card ── */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="glass w-full max-w-md p-8 rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight mb-1">Create an account</h1>
            <p className="text-sm text-[#8080a8]">Join the agentic commerce network</p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              Account created! Redirecting...
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5" htmlFor="name">
                Full Name / Business Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-[#e8e8f0] placeholder-[#606080] focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-[#e8e8f0] placeholder-[#606080] focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-[#e8e8f0] placeholder-[#606080] focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#a8a8c0] uppercase tracking-wider mb-1.5">
                Account Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("MERCHANT")}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    role === "MERCHANT"
                      ? "border-violet-500 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/[0.02] text-[#8080a8] hover:border-white/20"
                  }`}
                >
                  <div className="text-sm font-semibold">Merchant</div>
                  <div className="text-xs text-[#a0a0c0]">Accept agent orders</div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole("BUYER")}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    role === "BUYER"
                      ? "border-violet-500 bg-violet-500/20 text-white"
                      : "border-white/10 bg-white/[0.02] text-[#8080a8] hover:border-white/20"
                  }`}
                >
                  <div className="text-sm font-semibold">Buyer</div>
                  <div className="text-xs text-[#a0a0c0]">Deploy buyer agents</div>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="btn-primary w-full py-2.5 mt-2 flex items-center justify-center font-medium disabled:opacity-50"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-[#7070a0]">
            Already have an account?{" "}
            <Link href="/login" className="text-violet-400 hover:text-violet-300 font-medium">
              Sign In
            </Link>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="px-6 py-4 text-center text-xs text-[#505070]">
        IntentFlow · AI-Native Commerce Orchestration
      </footer>
    </div>
  );
}
