import type { ApiResponse, UserPublic, AuthSession } from "@intentflow/shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const TOKEN_KEY = "intentflow_auth_token";
const USER_KEY = "intentflow_auth_user";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserPublic | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserPublic;
  } catch {
    return null;
  }
}

export function setStoredSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export const ACTIVE_ORDER_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "PAYMENT_PENDING",
] as const;

export function isActiveOrderStatus(status: string): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly string[]).includes(status);
}

export function selectActiveBuyerOrder<T extends { status: string }>(
  orders: T[]
): T | undefined {
  return orders.find((order) => isActiveOrderStatus(order.status));
}

export function selectCheckoutOrder<T extends { status: string }>(
  orders: T[]
): T | undefined {
  const active = selectActiveBuyerOrder(orders);
  if (active) {
    return active;
  }

  const latest = orders[0];
  if (
    latest &&
    (latest.status === "PAID" || latest.status === "CANCELLED")
  ) {
    return latest;
  }

  return undefined;
}

export function selectBuyerHomeOrder<T extends { status: string }>(
  orders: T[]
): T | undefined {
  const active = selectActiveBuyerOrder(orders);
  if (active) {
    return active;
  }

  const latest = orders[0];
  if (latest?.status === "CANCELLED") {
    return latest;
  }

  return undefined;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearStoredSession();
  }

  const data = (await response.json()) as ApiResponse<T>;
  return data;
}
