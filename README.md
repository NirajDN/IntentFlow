# IntentFlow

> **AI proposes. Policy decides. Razorpay executes.**

IntentFlow is an AI-native commerce orchestration platform built for the **Razorpay AI Buildathon — Track 01: AI Growth & Agentic Commerce**.

---

## Architecture

```
IntentFlow/
├── apps/
│   ├── web/          # Next.js 15 frontend (TypeScript + Tailwind CSS)
│   └── api/          # Express 4 REST API (TypeScript)
├── packages/
│   ├── database/     # Prisma client + schema (PostgreSQL)
│   ├── shared/       # Shared types and utilities
│   └── ai/           # AI agent infrastructure (M2+, placeholder)
├── docker-compose.yml
└── .env.example
```

**Key principle**: Every package is a TypeScript-first npm workspace. `apps/` depend on `packages/`; packages never depend on apps.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| Docker | ≥ 24 |
| Docker Compose | ≥ 2 |

---

## Quick Start

### 1 — Clone and configure

```bash
git clone <repo-url> intentflow
cd intentflow
cp .env.example .env          # fill in real values for local dev
```

### 2 — Start infrastructure

```bash
npm run docker:up             # starts PostgreSQL 16 + Redis 7
```

### 3 — Install dependencies

```bash
npm install                   # installs all workspace packages
```

### 4 — Run database migrations

```bash
npm run db:generate           # generates Prisma client
npm run db:migrate            # applies migrations (requires postgres running)
```

### 5 — Start development servers

```bash
npm run dev
# API  → http://localhost:4000
# Web  → http://localhost:3000
```

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start all apps in watch/dev mode |
| `npm run build` | Build all apps and packages |
| `npm run typecheck` | TypeScript type-check across all workspaces |
| `npm run test` | Run tests across all workspaces |
| `npm run lint` | ESLint across all workspaces |
| `npm run docker:up` | Start PostgreSQL + Redis via Docker Compose |
| `npm run docker:down` | Stop infrastructure containers |
| `npm run db:generate` | Generate Prisma client from schema |
| `npm run db:migrate` | Run database migrations |

---

## API Reference (M1)

### `GET /api/health`

Returns the health status of the API and its dependencies.

**Response 200**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "0.1.0",
    "uptime": 42,
    "services": {
      "database": "ok",
      "redis": "ok"
    }
  },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## Environment Variables

See [`.env.example`](.env.example) for all required variables. **Never commit `.env`**.

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `API_PORT` | API server port (default: 4000) |
| `NODE_ENV` | `development` / `production` |
| `NEXT_PUBLIC_API_URL` | API base URL for the frontend |
| `RAZORPAY_KEY_ID` | Razorpay key ID (placeholder in M1) |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret (placeholder in M1) |

---

## Milestones

| Milestone | Status | Description |
|-----------|--------|-------------|
| M1 | ✅ Complete | Project foundation, monorepo, health endpoint, landing page |
| M2 | 🔜 Planned | AI agent infrastructure |
| M3 | 🔜 Planned | Policy engine |
| M4 | 🔜 Planned | Razorpay payment integration |
| M5 | 🔜 Planned | Commerce catalog & inventory |

---

## License

Private — Razorpay AI Buildathon submission.
