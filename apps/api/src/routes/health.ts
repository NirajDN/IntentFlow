import { Router, Request, Response } from "express";
import { apiSuccess } from "@intentflow/shared";
import type { HealthStatus } from "@intentflow/shared";
import prisma from "@intentflow/database";
import { getRedisClient } from "../lib/redis.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const startTime = process.hrtime.bigint();

  // Check database connectivity
  let dbStatus: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  // Check Redis connectivity
  let redisStatus: "ok" | "error" | "unknown" = "unknown";
  try {
    const redis = getRedisClient();
    await redis.ping();
    redisStatus = "ok";
  } catch {
    redisStatus = "error";
  }

  const endTime = process.hrtime.bigint();
  const uptimeMs = Number(endTime - startTime) / 1_000_000;

  const health: HealthStatus = {
    status: dbStatus === "ok" ? "ok" : "degraded",
    version: process.env["npm_package_version"] ?? "0.1.0",
    uptime: Math.floor(process.uptime()),
    services: {
      database: dbStatus,
      redis: redisStatus,
    },
  };

  const statusCode = health.status === "ok" ? 200 : 503;
  res.status(statusCode).json(apiSuccess(health));
});

export default router;
