import type { ServiceRole } from '../../config/env';

export type StructuredLogSeverity = 'debug' | 'info' | 'warn' | 'error';

export interface StructuredLogRecord {
  timestamp: string;
  severity: StructuredLogSeverity;
  event: string;
  serviceName: string;
  serviceRole: ServiceRole;
  correlationId?: string;
  [key: string]: unknown;
}

export type StructuredLogSink = (record: StructuredLogRecord) => void;

export interface StructuredLogger {
  child(context: Record<string, unknown>): StructuredLogger;
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, error?: unknown, fields?: Record<string, unknown>): void;
}

export function createStructuredLogger(
  context: {
    serviceName: string;
    serviceRole: ServiceRole;
    correlationId?: string;
  },
  sink: StructuredLogSink = defaultStructuredLogSink,
): StructuredLogger {
  return buildStructuredLogger(
    {
      serviceName: context.serviceName,
      serviceRole: context.serviceRole,
      correlationId: context.correlationId,
    },
    sink,
  );
}

function buildStructuredLogger(
  baseContext: Record<string, unknown>,
  sink: StructuredLogSink,
): StructuredLogger {
  return {
    child(context: Record<string, unknown>): StructuredLogger {
      return buildStructuredLogger(
        {
          ...baseContext,
          ...context,
        },
        sink,
      );
    },
    debug(event, fields) {
      emitStructuredLog(baseContext, 'debug', event, undefined, fields, sink);
    },
    info(event, fields) {
      emitStructuredLog(baseContext, 'info', event, undefined, fields, sink);
    },
    warn(event, fields) {
      emitStructuredLog(baseContext, 'warn', event, undefined, fields, sink);
    },
    error(event, error, fields) {
      emitStructuredLog(baseContext, 'error', event, error, fields, sink);
    },
  };
}

function emitStructuredLog(
  baseContext: Record<string, unknown>,
  severity: StructuredLogSeverity,
  event: string,
  error: unknown,
  fields: Record<string, unknown> | undefined,
  sink: StructuredLogSink,
) {
  const record: StructuredLogRecord = {
    timestamp: new Date().toISOString(),
    severity,
    event,
    serviceName: String(baseContext.serviceName),
    serviceRole: baseContext.serviceRole as ServiceRole,
    ...baseContext,
    ...fields,
  };

  if (error) {
    record.error = serializeError(error);
  }

  sink(record);
}

function defaultStructuredLogSink(record: StructuredLogRecord) {
  const line = JSON.stringify(record);

  if (record.severity === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}
