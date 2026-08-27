import { Request, Response, NextFunction } from "express";
import { apiError, UserRole } from "@intentflow/shared";
import prisma from "@intentflow/database";
import { verifyToken } from "../lib/auth.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json(apiError("Authentication required: missing or invalid authorization header"));
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json(apiError("Authentication required: empty token"));
    return;
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!user) {
      res.status(401).json(apiError("User account not found or deactivated"));
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
    };
    next();
  } catch (err) {
    res.status(401).json(apiError("Invalid or expired authentication token"));
  }
}

export function requireRole(allowedRoles: UserRole | UserRole[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(apiError("Authentication required"));
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json(apiError(`Access denied: required role (${roles.join(", ")}), got ${req.user.role}`));
      return;
    }

    next();
  };
}
