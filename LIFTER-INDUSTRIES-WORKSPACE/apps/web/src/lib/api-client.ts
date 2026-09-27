import type { ApiFailure, ApiSuccess } from "@erp/types";
import { useUiStore } from "../state/ui-store.js";

const apiBase =
  (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/+$/, "") || "/api";
let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

function isAuthenticationPath(path: string): boolean {
  return path === "/auth/login" || path === "/auth/register" || path === "/auth/refresh";
}

async function decode<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !payload.success) {
    const failure = payload.success ? undefined : payload.error;
    throw new ApiError(
      response.status,
      failure?.code ?? "REQUEST_FAILED",
      failure?.message ?? response.statusText,
      failure?.details,
    );
  }
  return payload.data;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${apiBase}/auth/refresh`, { method: "POST", credentials: "include" })
      .then(async (response) => {
        const session = await decode<{ accessToken: string }>(response);
        accessToken = session.accessToken;
        return session.accessToken;
      })
      .catch(() => {
        accessToken = null;
        return null;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}, canRefresh = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const companyId = useUiStore.getState().selectedCompanyId;
  if (companyId) headers.set("X-Company-Id", companyId);

  const response = await fetch(`${apiBase}${path}`, { ...init, headers, credentials: "include" });
  if (response.status === 401 && canRefresh && !isAuthenticationPath(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, init, false);
    if (window.location.pathname !== "/session-expired") window.location.assign("/session-expired");
  }
  return decode<T>(response);
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  },
  put<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
  },
  delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};
