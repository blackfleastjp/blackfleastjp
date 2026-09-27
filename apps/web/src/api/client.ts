import { useAuthStore } from '../state/auth-store';
import type { AuthResponse } from '../types';

const apiBase = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');
// A refresh JWT is single-use, so concurrent 401s must share one rotation request.
let refreshInFlight: Promise<boolean> | null = null;

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    const companyId = useAuthStore.getState().activeCompanyId;
    const headers = new Headers();
    if (companyId) headers.set('X-Company-Id', companyId);
    refreshInFlight = fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers,
    })
      .then(async (response) => {
        if (response.status === 204) return false;
        if (!response.ok) return false;
        const session = (await response.json()) as AuthResponse;
        useAuthStore.getState().setSession(session.accessToken, session.user);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function send<T>(path: string, init: RequestInit, includeToken: boolean): Promise<T> {
  const token = includeToken ? useAuthStore.getState().accessToken : null;
  const headers = new Headers(init.headers);
  const companyId = useAuthStore.getState().activeCompanyId;
  if (companyId && !headers.has('X-Company-Id')) headers.set('X-Company-Id', companyId);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(`${apiBase}${path}`, { ...init, headers, credentials: 'include' }).then(
    async (response) => {
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(
          payload.error ?? `Request failed (${response.status}).`,
          response.status,
        );
      }
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    },
  );
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await send<T>(path, init, true);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    if (!(await refreshSession())) {
      useAuthStore.getState().clearSession();
      throw error;
    }
    return send<T>(path, init, true);
  }
}

export function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return send<T>(path, init, false);
}

export { refreshSession };
