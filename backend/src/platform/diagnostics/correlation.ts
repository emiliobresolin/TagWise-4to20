import { randomUUID } from 'node:crypto';

export const correlationIdHeaderName = 'x-correlation-id';

export function generateCorrelationId(): string {
  return randomUUID();
}

export function resolveCorrelationId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return resolveCorrelationId(value[0]);
  }

  if (!value) {
    return generateCorrelationId();
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return generateCorrelationId();
  }

  return trimmed.slice(0, 120);
}
