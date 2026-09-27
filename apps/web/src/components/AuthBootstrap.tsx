import { useEffect } from 'react';
import { refreshSession } from '../api/client';
import { useAuthStore } from '../state/auth-store';

export function AuthBootstrap(): null {
  const initialized = useAuthStore((state) => state.initialized);
  const setInitialized = useAuthStore((state) => state.setInitialized);

  useEffect(() => {
    if (initialized) return;
    void refreshSession().finally(setInitialized);
  }, [initialized, setInitialized]);

  return null;
}
