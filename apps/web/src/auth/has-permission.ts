import { useAuthStore } from '../state/auth-store';

const emptyPermissions: string[] = [];

export function usePermissions(): string[] {
  return useAuthStore((state) => state.user?.permissions ?? emptyPermissions);
}
