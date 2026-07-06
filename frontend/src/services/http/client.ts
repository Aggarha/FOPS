import { logger } from '@/lib/logger';
import { buildApiUrl, clearAuthTokens, getAccessToken, getTenantId } from '@/lib/runtime';
import { ValidationError, type Validator } from '@/lib/validation';

export interface HttpRequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  auth?: boolean;
  body?: unknown;
  headers?: Record<string, string>;
  validator?: Validator<T>;
  signal?: AbortSignal;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function getRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  if (contentType.includes('text/')) return response.text();
  return undefined;
}

export async function requestJson<T = unknown>(
  path: string,
  options: HttpRequestOptions<T> = {}
): Promise<T> {
  const {
    method = 'GET',
    auth = true,
    body,
    headers = {},
    validator,
    signal,
  } = options;

  const requestId = getRequestId();
  const tenantId = getTenantId();

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-Id': requestId,
    'X-FOPS-Client': 'dashboard-web',
    ...headers,
  };

  if (tenantId) {
    finalHeaders['X-Tenant-Id'] = tenantId;
  }

  if (auth) {
    const token = getAccessToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const context = { scope: 'http-client', operation: `${method} ${path}`, requestId, tenantId };
  logger.debug('HTTP request start', context);

  const response = await fetch(buildApiUrl(path), {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal,
  });

  if (response.status === 401 && auth) {
    clearAuthTokens();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  const parsed = await parseResponseBody(response);

  if (!response.ok) {
    const detail =
      typeof parsed === 'object' && parsed !== null && 'detail' in parsed
        ? String((parsed as { detail?: unknown }).detail)
        : `HTTP ${response.status}`;
    const error = new HttpError(detail, response.status, parsed);
    logger.warn('HTTP request failed', context, error);
    throw error;
  }

  if (!validator) {
    logger.debug('HTTP request success', context);
    return parsed as T;
  }

  try {
    const validated = validator(parsed);
    logger.debug('HTTP response validated', context);
    return validated;
  } catch (error) {
    const validationError =
      error instanceof ValidationError
        ? error
        : new ValidationError('Response validation failed', { error });
    logger.error('HTTP response validation failed', context, validationError);
    throw validationError;
  }
}
