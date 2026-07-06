export interface QueueJobEnvelope<TPayload = unknown> {
  id: string;
  queue: string;
  tenantId: string;
  correlationId: string;
  payload: TPayload;
  createdAt: string;
}

export interface QueueWorkerHealth {
  worker: string;
  queue: string;
  inFlight: number;
  lagSeconds: number;
  status: 'healthy' | 'degraded' | 'stalled';
}

export interface QueueRetryPolicy {
  maxRetries: number;
  backoffSeconds: number[];
  deadLetterQueue: string;
}
