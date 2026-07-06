export const AUTH_STORAGE_KEYS = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  user: 'user',
  tenantId: 'tenant_id',
} as const;

const DEFAULT_BACKEND_URL = 'http://localhost:8001';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getBackendBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_URL;

  if (configured && configured.trim()) {
    return normalizeBaseUrl(configured.trim());
  }

  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    return normalizeBaseUrl(window.location.origin);
  }

  return DEFAULT_BACKEND_URL;
}

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getBackendBaseUrl()}${normalizedPath}`;
}

export function buildWebSocketUrl(path: string): string {
  if (/^wss?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getBackendBaseUrl();
  const wsBase = base.startsWith('https://')
    ? `wss://${base.slice('https://'.length)}`
    : `ws://${base.slice('http://'.length)}`;
  return `${wsBase}${normalizedPath}`;
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken);
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, accessToken);
  localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, refreshToken);
}

export function clearAuthTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken);
  localStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
  localStorage.removeItem(AUTH_STORAGE_KEYS.user);
}

export function getTenantId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_STORAGE_KEYS.tenantId);
}
