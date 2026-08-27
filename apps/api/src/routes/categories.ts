import { Router, Request, Response } from "express";
import { apiError, apiSuccess } from "@intentflow/shared";
import prisma from "@intentflow/database";
import { authenticateUser, requireRole, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

// ─── GET /api/categories ──────────────────────────────────────
router.get("/", async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    res.status(200).json(apiSuccess(categories));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch categories";
    res.status(500).json(apiError(message));
  }
});

// ─── POST /api/categories ─────────────────────────────────────
router.post(
  "/",
  authenticateUser,
  requireRole(["MERCHANT", "ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, slug } = req.body as { name?: string; slug?: string };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json(apiError("Category name is required"));
      return;
    }

    const normalizedSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    try {
      const existing = await prisma.category.findUnique({
        where: { slug: normalizedSlug },
      });

      if (existing) {
        res.status(409).json(apiError("Category with this slug already exists"));
        return;
      }

      const category = await prisma.category.create({
        data: {
          name: name.trim(),
          slug: normalizedSlug,
        },
      });

      res.status(201).json(apiSuccess(category));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create category";
      res.status(500).json(apiError(message));
    }
  }
);

export default router;
