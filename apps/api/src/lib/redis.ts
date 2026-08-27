import Redis from "ioredis";
import logger from "./logger.js";

// ─── Redis Client Placeholder ────────────────────────────────
// Connection is established lazily; errors are logged but do
// not crash the process in M1 (Redis is optional in dev).
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env["REDIS_URL"] ?? "redis://localhost:6379";
    redisClient = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    redisClient.on("connect", () => {
      logger.info("Redis connected");
    });

    redisClient.on("error", (err) => {
      logger.warn({ err }, "Redis connection error — continuing without cache");
    });
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
