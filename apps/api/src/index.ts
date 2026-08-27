import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import logger from "./lib/logger.js";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import merchantsRouter from "./routes/merchants.js";
import categoriesRouter from "./routes/categories.js";
import productsRouter from "./routes/products.js";
import inventoryRouter from "./routes/inventory.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();
const PORT = parseInt(process.env["API_PORT"] ?? "4000", 10);

// ─── Security & Parsing ──────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── Request Logging ─────────────────────────────────────────
if (process.env["NODE_ENV"] !== "test") {
  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url }, "→ request");
    next();
  });
}

// ─── Routes ──────────────────────────────────────────────────
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/merchants", merchantsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/products", productsRouter);
app.use("/api/inventory", inventoryRouter);

// ─── Fallthrough ─────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Boot ────────────────────────────────────────────────────
if (process.env["NODE_ENV"] !== "test") {
  const server = app.listen(PORT, () => {
    logger.info(`IntentFlow API running on http://localhost:${PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    server.close(() => process.exit(0));
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

export default app;
