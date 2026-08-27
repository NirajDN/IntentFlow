import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { JwtUserPayload, UserPublic, UserRole } from "@intentflow/shared";
import type { User } from "@prisma/client";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "default-dev-secret-change-in-production";
const JWT_EXPIRES_IN = process.env["JWT_EXPIRES_IN"] ?? "7d";

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtUserPayload {
  return jwt.verify(token, JWT_SECRET) as JwtUserPayload;
}

export function toPublicUser(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
