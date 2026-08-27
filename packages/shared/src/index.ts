/**
 * @intentflow/shared
 * Shared types, constants, and utilities across IntentFlow apps.
 */

// ─── API Response Shape ──────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { success: true, data, timestamp: new Date().toISOString() };
}

export function apiError(error: string): ApiResponse<never> {
  return { success: false, error, timestamp: new Date().toISOString() };
}

// ─── Health Check ────────────────────────────────────────────
export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  version: string;
  uptime: number;
  services: Record<string, "ok" | "error" | "unknown">;
}

// ─── Auth & User Types ───────────────────────────────────────
export type UserRole = "BUYER" | "MERCHANT" | "ADMIN";

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface AuthSession {
  token: string;
  user: UserPublic;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface JwtUserPayload {
  userId: string;
  email: string;
  role: UserRole;
}

// ─── Merchant Types ──────────────────────────────────────────
export interface MerchantPolicyDTO {
  id: string;
  merchantId: string;
  currency: string;
  defaultAutonomousSpendLimit: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface MerchantDTO {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  description: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  policy?: MerchantPolicyDTO | null;
}

export interface CreateMerchantInput {
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateMerchantInput {
  name?: string;
  description?: string;
  defaultAutonomousSpendLimit?: number;
  currency?: string;
}
