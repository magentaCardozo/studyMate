import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiRequest, onSessionExpired } from '../lib/api';
import type { User } from '../types/api';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; preferredLanguage: 'fr' | 'en' }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/users/me').catch((e) => (e.status === 401 ? null : Promise.reject(e))),
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(
    () =>
      onSessionExpired(() => {
        qc.setQueryData(['me'], null);
      }),
    [qc],
  );

  // On conserve la requête « me » (observée par ce fournisseur) et on purge le reste du cache.
  const resetCache = (user: User | null) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    qc.setQueryData(['me'], user);
  };

  const value: AuthValue = {
    user: me.data ?? null,
    loading: me.isLoading,
    async login(email, password) {
      const r = await apiRequest<{ data: { user: User } }>('/auth/login', { method: 'POST', body: { email, password }, noRefresh: true });
      resetCache(r.data.user);
    },
    async register(input) {
      const r = await apiRequest<{ data: { user: User } }>('/auth/register', {
        method: 'POST',
        body: { ...input, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Kinshasa' },
        noRefresh: true,
      });
      resetCache(r.data.user);
    },
    async logout() {
      await apiRequest('/auth/logout', { method: 'POST', noRefresh: true }).catch(() => {});
      resetCache(null);
    },
    refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider manquant');
  return ctx;
}
