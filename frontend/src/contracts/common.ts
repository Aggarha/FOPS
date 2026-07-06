export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unavailable';
  version?: string;
  latencyMs?: number;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorPayload {
  detail: string;
  code?: string;
  request_id?: string;
}

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  userId?: number;
}
