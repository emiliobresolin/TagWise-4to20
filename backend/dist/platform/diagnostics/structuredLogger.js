"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStructuredLogger = createStructuredLogger;
function createStructuredLogger(context, sink = defaultStructuredLogSink) {
    return buildStructuredLogger({
        serviceName: context.serviceName,
        serviceRole: context.serviceRole,
        correlationId: context.correlationId,
    }, sink);
}
function buildStructuredLogger(baseContext, sink) {
    return {
        child(context) {
            return buildStructuredLogger({
                ...baseContext,
                ...context,
            }, sink);
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
function emitStructuredLog(baseContext, severity, event, error, fields, sink) {
    const record = {
        timestamp: new Date().toISOString(),
        severity,
        event,
        serviceName: String(baseContext.serviceName),
        serviceRole: baseContext.serviceRole,
        ...baseContext,
        ...fields,
    };
    if (error) {
        record.error = serializeError(error);
    }
    sink(record);
}
function defaultStructuredLogSink(record) {
    const line = JSON.stringify(record);
    if (record.severity === 'error') {
        console.error(line);
        return;
    }
    console.log(line);
}
function serializeError(error) {
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
