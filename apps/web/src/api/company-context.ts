import { apiRequest } from './client';
import { useAuthStore } from '../state/auth-store';
import type { AuthUser } from '../types';

export async function activateCompanyContext(companyId: string): Promise<AuthUser> {
  const store = useAuthStore.getState();
  const previousCompanyId = store.activeCompanyId ?? store.user?.companyId ?? null;
  store.setActiveCompany(companyId);
  try {
    const result = await apiRequest<{ user: AuthUser }>('/auth/me');
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) throw new Error('Your session has expired. Sign in again.');
    useAuthStore.getState().setSession(accessToken, result.user);
    return result.user;
  } catch (error) {
    if (previousCompanyId) useAuthStore.getState().setActiveCompany(previousCompanyId);
    throw error;
  }
}
