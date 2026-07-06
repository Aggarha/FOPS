export class ValidationError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

export type Validator<T> = (input: unknown) => T;

export function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ValidationError(`Invalid ${field}: expected string`);
  return value;
}

export function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ValidationError(`Invalid ${field}: expected number`);
  }
  return value;
}

export function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ValidationError(`Invalid ${field}: expected boolean`);
  return value;
}

export function asArray<T>(
  value: unknown,
  field: string,
  mapper: (item: unknown, index: number) => T
): T[] {
  if (!Array.isArray(value)) throw new ValidationError(`Invalid ${field}: expected array`);
  return value.map(mapper);
}
