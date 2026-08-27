import { Router, Response } from "express";
import { apiError, apiSuccess } from "@intentflow/shared";
import prisma from "@intentflow/database";
import { authenticateUser, requireRole, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─── POST /api/merchants ──────────────────────────────────────
router.post(
  "/",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, slug, description } = req.body as {
      name?: string;
      slug?: string;
      description?: string;
    };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json(apiError("Merchant name is required"));
      return;
    }

    if (!slug || typeof slug !== "string" || !SLUG_REGEX.test(slug.trim().toLowerCase())) {
      res.status(400).json(apiError("Valid merchant slug (lowercase alphanumeric and hyphens) is required"));
      return;
    }

    const normalizedSlug = slug.trim().toLowerCase();

    try {
      const existing = await prisma.merchant.findUnique({
        where: { slug: normalizedSlug },
      });

      if (existing) {
        res.status(409).json(apiError("A merchant with this slug already exists"));
        return;
      }

      // Check if this merchant owner already has a merchant (or create new)
      // Automatically create merchant + default policy in a transaction
      const merchant = await prisma.merchant.create({
        data: {
          name: name.trim(),
          slug: normalizedSlug,
          description: description?.trim() || null,
          ownerId: req.user!.id, // Enforce server-side ownership
          policy: {
            create: {
              currency: "INR",
              defaultAutonomousSpendLimit: 5000.0,
            },
          },
        },
        include: {
          policy: true,
        },
      });

      res.status(201).json(apiSuccess(merchant));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create merchant";
      res.status(500).json(apiError(message));
    }
  }
);

// ─── GET /api/merchants/me ────────────────────────────────────
router.get(
  "/me",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const merchant = await prisma.merchant.findFirst({
        where: { ownerId: req.user!.id },
        include: { policy: true },
      });

      if (!merchant) {
        res.status(404).json(apiError("No merchant found for current user"));
        return;
      }

      res.status(200).json(apiSuccess(merchant));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch merchant";
      res.status(500).json(apiError(message));
    }
  }
);

// ─── PATCH /api/merchants/me ──────────────────────────────────
router.patch(
  "/me",
  authenticateUser,
  requireRole("MERCHANT"),
  async (req: AuthenticatedRequest, res: Response) => {
    const { name, description, defaultAutonomousSpendLimit, currency } = req.body as {
      name?: string;
      description?: string;
      defaultAutonomousSpendLimit?: number;
      currency?: string;
    };

    try {
      const existing = await prisma.merchant.findFirst({
        where: { ownerId: req.user!.id },
        include: { policy: true },
      });

      if (!existing) {
        res.status(404).json(apiError("No merchant found to update"));
        return;
      }

      // Update merchant and policy
      const updated = await prisma.merchant.update({
        where: { id: existing.id },
        data: {
          ...(name && typeof name === "string" ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description: description?.trim() || null } : {}),
          policy: {
            upsert: {
              create: {
                currency: currency?.trim() || "INR",
                defaultAutonomousSpendLimit:
                  typeof defaultAutonomousSpendLimit === "number" ? defaultAutonomousSpendLimit : 5000.0,
              },
              update: {
                ...(currency && typeof currency === "string" ? { currency: currency.trim() } : {}),
                ...(typeof defaultAutonomousSpendLimit === "number" ? { defaultAutonomousSpendLimit } : {}),
              },
            },
          },
        },
        include: { policy: true },
      });

      res.status(200).json(apiSuccess(updated));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update merchant";
      res.status(500).json(apiError(message));
    }
  }
);

export default router;
