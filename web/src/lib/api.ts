/**
 * Client HTTP centralisé. Authentification par cookies HttpOnly (même origine),
 * en-tête anti-CSRF, rafraîchissement automatique de session, erreurs typées.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number; unread?: number };
}

const BASE = '/api/v1';
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

/** Notifié lorsque la session ne peut plus être renouvelée. */
export function onSessionExpired(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'StudyMate' } })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

interface Options {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** Ne pas tenter de rafraîchir la session (routes d'authentification). */
  noRefresh?: boolean;
}

export async function apiRequest<T>(path: string, opts: Options = {}, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      signal: opts.signal,
      headers: { 'X-Requested-With': 'StudyMate', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Connexion impossible. Vérifiez votre accès à Internet.');
  }
  if (res.status === 401 && !opts.noRefresh && !retried) {
    if (await refreshSession()) return apiRequest<T>(path, opts, true);
    listeners.forEach((l) => l());
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? 'Une erreur est survenue.', err?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<{ data: T }>(path, { signal }).then((r) => r.data),
  page: <T>(path: string, signal?: AbortSignal) => apiRequest<Paged<T>>(path, { signal }),
  post: <T>(path: string, body: unknown = {}) => apiRequest<{ data: T }>(path, { method: 'POST', body }).then((r) => r?.data),
  patch: <T>(path: string, body: unknown) => apiRequest<{ data: T }>(path, { method: 'PATCH', body }).then((r) => r.data),
  put: <T>(path: string, body: unknown) => apiRequest<{ data: T }>(path, { method: 'PUT', body }).then((r) => r.data),
  del: (path: string, body?: unknown) => apiRequest<void>(path, { method: 'DELETE', body }),
};

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  return 'Une erreur inattendue est survenue.';
}
