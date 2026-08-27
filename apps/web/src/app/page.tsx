import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IntentFlow — AI-Native Commerce Orchestration",
};

const API_URL =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

// ── Feature card data ─────────────────────────────────────────────────────────
const features = [
  {
    icon: "🧠",
    title: "AI Proposes",
    description:
      "Autonomous agents interpret buyer intent, discover products, negotiate terms, and craft optimal purchase proposals — all without human friction.",
    color: "from-violet-500/20 to-purple-500/10",
    border: "border-violet-500/20",
  },
  {
    icon: "⚖️",
    title: "Policy Decides",
    description:
      "Every AI action is validated against merchant-defined policies — spend limits, approval gates, allowed vendors, and compliance rules.",
    color: "from-indigo-500/20 to-blue-500/10",
    border: "border-indigo-500/20",
  },
  {
    icon: "⚡",
    title: "Razorpay Executes",
    description:
      "Policy-approved orders trigger instant, reliable payments via Razorpay — fully auditable, with real-time status and reconciliation.",
    color: "from-cyan-500/20 to-teal-500/10",
    border: "border-cyan-500/20",
  },
];

// ── Stats ─────────────────────────────────────────────────────────────────────
const stats = [
  { value: "< 2s", label: "Intent to checkout" },
  { value: "100%", label: "Policy governed" },
  { value: "0", label: "Manual approvals needed" },
  { value: "∞", label: "Concurrent agents" },
];

// ── Architecture steps ────────────────────────────────────────────────────────
const flow = [
  { step: "01", title: "Capture Intent", desc: "User or system expresses a purchase goal in natural language." },
  { step: "02", title: "AI Reasoning", desc: "Agent researches, compares, and builds an optimal proposal." },
  { step: "03", title: "Policy Gate", desc: "Proposal is validated against merchant rules before any action." },
  { step: "04", title: "Payment Execution", desc: "Razorpay processes the approved transaction with full auditability." },
];

export default function HomePage() {
  return (
    <div className="noise min-h-screen bg-[#05050f] text-[#e8e8f0]">
      {/* ── Ambient background orbs ─────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="animate-pulse-glow absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          className="animate-pulse-glow delay-500 absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(6,182,212,0.14) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(79,70,229,0.06) 0%, transparent 60%)",
          }}
        />
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">IntentFlow</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300 sm:block">
            Razorpay AI Buildathon · Track 01
          </span>
          <a
            href="/merchant"
            className="glass rounded-xl px-3 py-1.5 text-xs font-medium text-violet-300 transition-all duration-300 hover:-translate-y-0.5"
          >
            Merchant Workspace
          </a>
          <a
            href="/login"
            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[#e8e8f0] transition-all duration-300 hover:border-violet-500/40"
          >
            Sign In
          </a>
          <a
            href="/register"
            className="btn-primary rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-300 hover:-translate-y-0.5"
          >
            Register
          </a>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-20 text-center md:px-12 md:pt-32">
        {/* Badge */}
        <div className="animate-fade-up mb-8 flex justify-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-[#a8a8c0]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            M1 · Project Foundation Live
          </span>
        </div>

        {/* Headline */}
        <h1 className="animate-fade-up delay-100 mb-6 text-5xl font-black leading-tight tracking-tight opacity-0 md:text-7xl lg:text-8xl">
          Commerce that{" "}
          <span className="gradient-text">thinks</span>
          <br />
          before it{" "}
          <span className="gradient-text-brand">acts</span>
        </h1>

        {/* Subheadline */}
        <p className="animate-fade-up delay-200 mx-auto mb-4 max-w-2xl text-lg leading-relaxed text-[#9090b0] opacity-0 md:text-xl">
          IntentFlow is an AI-native commerce orchestration platform. Autonomous
          agents propose, policy engines decide, Razorpay executes — all in
          seconds.
        </p>

        {/* Core principle */}
        <p className="animate-fade-up delay-300 mb-10 font-mono text-sm font-medium tracking-widest text-violet-400 opacity-0 uppercase">
          AI proposes · Policy decides · Razorpay executes
        </p>

        {/* CTA buttons */}
        <div className="animate-fade-up delay-500 flex flex-col items-center justify-center gap-4 opacity-0 sm:flex-row">
          <button
            id="cta-docs"
            className="btn-primary relative z-10 text-base"
            type="button"
          >
            Read the Docs
          </button>
          <a
            id="cta-health"
            href={`${API_URL}/api/health`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-base inline-block"
          >
            API Health →
          </a>
        </div>
      </section>

      {/* ── Stats strip ──────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-20 md:px-12">
        <div className="glass grid grid-cols-2 gap-px overflow-hidden rounded-2xl md:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col items-center justify-center p-6 text-center transition-colors duration-300 hover:bg-white/[0.04]"
            >
              <span className="gradient-text mb-1 text-3xl font-black md:text-4xl">
                {s.value}
              </span>
              <span className="text-xs text-[#7070a0] uppercase tracking-wider">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 md:px-12">
        <div className="mb-14 text-center">
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">
            The three-layer architecture
          </h2>
          <p className="text-[#7070a0]">
            Every transaction follows the same trustworthy pipeline.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className={`glass group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 bg-gradient-to-br ${f.color} border ${f.border}`}
            >
              <div className="mb-4 text-4xl">{f.icon}</div>
              <h3 className="mb-2 text-xl font-bold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-[#8080a8]">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Flow diagram ─────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 md:px-12">
        <div className="mb-14 text-center">
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">
            How a transaction flows
          </h2>
          <p className="text-[#7070a0]">From intent to settlement in four steps.</p>
        </div>
        <div className="relative">
          {/* Connector line */}
          <div className="absolute top-10 left-10 right-10 hidden h-px md:block"
            style={{ background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.4), rgba(6,182,212,0.4), transparent)" }}
          />
          <div className="grid gap-6 md:grid-cols-4">
            {flow.map((f, i) => (
              <div key={f.step} className="glass relative flex flex-col items-center rounded-2xl p-5 text-center">
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{
                    background: `linear-gradient(135deg, hsl(${260 - i * 20}, 80%, 55%), hsl(${240 - i * 20}, 70%, 50%))`,
                    boxShadow: `0 4px 12px hsla(${260 - i * 20}, 80%, 55%, 0.4)`,
                  }}
                >
                  {f.step}
                </div>
                <h3 className="mb-1 font-bold">{f.title}</h3>
                <p className="text-xs leading-relaxed text-[#7070a0]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech stack ───────────────────────────────────────────────────── */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-24 md:px-12">
        <div className="glass rounded-2xl p-8 text-center">
          <h2 className="mb-6 text-2xl font-bold">Built with</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              "Next.js 16",
              "React 19",
              "TypeScript",
              "Tailwind CSS",
              "Express",
              "PostgreSQL",
              "Prisma",
              "Redis",
              "Docker",
            ].map((tech) => (
              <span
                key={tech}
                className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-sm font-medium text-[#a8a8c0] transition-all duration-200 hover:border-violet-500/40 hover:text-violet-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/[0.06] px-6 py-8 text-center text-sm text-[#606080]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 md:flex-row">
          <span className="font-semibold text-[#e8e8f0]">IntentFlow</span>
          <span>
            Razorpay AI Buildathon · Track 01: AI Growth &amp; Agentic Commerce
          </span>
          <span className="font-mono text-xs">M1 · Foundation</span>
        </div>
      </footer>
    </div>
  );
}
