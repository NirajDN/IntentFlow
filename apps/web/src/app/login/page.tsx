"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, setStoredSession } from "@/lib/api";
import BrandIcon from "@/components/BrandIcon";
import type { AuthSession } from "@intentflow/shared";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch<AuthSession>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!res.success || !res.data) {
        setError(res.error || "Login failed. Please check your credentials.");
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
      setError("Unable to connect to the authentication server.");
      setLoading(false);
    }
  };

  return (
    <div className="noise min-h-screen bg-[#05050f] text-[#e8e8f0] flex flex-col justify-between">
      {/* ── Header ── */}
      <header className="px-6 py-5 md:px-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
            }}
          >
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
            <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome back</h1>
            <p className="text-sm text-[#8080a8]">Sign in to your IntentFlow account</p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              Login successful! Redirecting...
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-[#e8e8f0] placeholder-[#606080] focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="btn-primary w-full py-2.5 mt-2 flex items-center justify-center font-medium disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-[#7070a0]">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-violet-400 hover:text-violet-300 font-medium">
              Create an account
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
