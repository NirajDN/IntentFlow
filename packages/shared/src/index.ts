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

// ─── M3 Catalog & Inventory Types ────────────────────────────

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateCategoryInput {
  name: string;
  slug?: string;
}

export interface ProductVariantDTO {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  specifications: Record<string, unknown>;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateProductVariantInput {
  name: string;
  sku: string;
  price: number;
  specifications?: Record<string, unknown>;
  isActive?: boolean;
}

export interface InventoryAdjustmentDTO {
  id: string;
  inventoryId: string;
  quantityChange: number;
  reason: string;
  createdAt: string | Date;
}

export interface InventoryDTO {
  id: string;
  productId: string;
  availableQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  adjustments?: InventoryAdjustmentDTO[];
}

export interface ProductDTO {
  id: string;
  merchantId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  price: number;
  currency: string;
  specifications: Record<string, unknown>;
  tags: string[];
  imageUrl: string | null;
  deliveryInfo: string | null;
  returnPolicy: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  category?: CategoryDTO | null;
  inventory?: InventoryDTO | null;
  variants?: ProductVariantDTO[];
}

export interface CreateProductInput {
  name: string;
  slug?: string;
  categoryId?: string;
  categoryName?: string;
  description?: string;
  brand?: string;
  price: number;
  currency?: string;
  specifications?: Record<string, unknown>;
  tags?: string[];
  imageUrl?: string;
  deliveryInfo?: string;
  returnPolicy?: string;
  isActive?: boolean;
  initialStock?: number;
  sku?: string;
  variants?: CreateProductVariantInput[];
}

export interface UpdateProductInput {
  name?: string;
  slug?: string;
  categoryId?: string | null;
  description?: string | null;
  brand?: string | null;
  price?: number;
  currency?: string;
  specifications?: Record<string, unknown>;
  tags?: string[];
  imageUrl?: string | null;
  deliveryInfo?: string | null;
  returnPolicy?: string | null;
  isActive?: boolean;
}

export interface AdjustInventoryInput {
  quantityChange: number;
  reason: string;
}

export interface UpdateInventoryInput {
  availableQuantity?: number;
  reservedQuantity?: number;
  soldQuantity?: number;
  reason?: string;
}

export interface ProductPaginatedResponse {
  items: ProductDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CsvRowError {
  row: number;
  error: string;
  data?: Record<string, string>;
}

export interface CsvImportResult {
  total: number;
  imported: number;
  failed: number;
  errors: CsvRowError[];
}
