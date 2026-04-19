"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.correlationIdHeaderName = void 0;
exports.generateCorrelationId = generateCorrelationId;
exports.resolveCorrelationId = resolveCorrelationId;
const node_crypto_1 = require("node:crypto");
exports.correlationIdHeaderName = 'x-correlation-id';
function generateCorrelationId() {
    return (0, node_crypto_1.randomUUID)();
}
function resolveCorrelationId(value) {
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
