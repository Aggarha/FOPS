export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  scope: string;
  operation?: string;
  requestId?: string;
  tenantId?: string | null;
  [key: string]: unknown;
}

interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

function shouldLog(level: LogLevel): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return level === 'warn' || level === 'error';
}

function safeError(error: unknown): StructuredLog['error'] | undefined {
  if (!(error instanceof Error)) return undefined;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function write(level: LogLevel, message: string, context: LogContext, error?: unknown): void {
  if (!shouldLog(level)) return;

  const payload: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    error: safeError(error),
  };

  const serialized = JSON.stringify(payload);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else if (level === 'info') console.info(serialized);
  else console.debug(serialized);
}

export const logger = {
  debug(message: string, context: LogContext): void {
    write('debug', message, context);
  },
  info(message: string, context: LogContext): void {
    write('info', message, context);
  },
  warn(message: string, context: LogContext, error?: unknown): void {
    write('warn', message, context, error);
  },
  error(message: string, context: LogContext, error?: unknown): void {
    write('error', message, context, error);
  },
};
