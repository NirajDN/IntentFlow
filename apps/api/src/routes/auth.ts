import { Router, Request, Response } from "express";
import { apiError, apiSuccess, UserRole } from "@intentflow/shared";
import prisma from "@intentflow/database";
import { hashPassword, comparePassword, generateToken, toPublicUser } from "../lib/auth.js";
import { authenticateUser, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── POST /api/auth/register ──────────────────────────────────
router.post("/register", async (req: Request, res: Response) => {
  const { email, password, name, role } = req.body as {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
  };

  if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    res.status(400).json(apiError("Valid email address is required"));
    return;
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    res.status(400).json(apiError("Password must be at least 6 characters"));
    return;
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json(apiError("Name is required"));
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole: UserRole = role === "MERCHANT" ? "MERCHANT" : role === "ADMIN" ? "ADMIN" : "BUYER";

  try {
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      res.status(409).json(apiError("A user with this email already exists"));
      return;
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name.trim(),
        role: normalizedRole,
      },
    });

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
    });

    res.status(201).json(
      apiSuccess({
        token,
        user: toPublicUser(user),
      })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Registration failed";
    res.status(500).json(apiError(message));
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    res.status(400).json(apiError("Email and password are required"));
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      res.status(401).json(apiError("Invalid email or password"));
      return;
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json(apiError("Invalid email or password"));
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
    });

    res.status(200).json(
      apiSuccess({
        token,
        user: toPublicUser(user),
      })
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Login failed";
    res.status(500).json(apiError(message));
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────
router.get("/me", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      res.status(404).json(apiError("User not found"));
      return;
    }

    res.status(200).json(apiSuccess(toPublicUser(user)));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch user profile";
    res.status(500).json(apiError(message));
  }
});

export default router;
