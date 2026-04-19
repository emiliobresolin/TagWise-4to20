"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const structuredLogger_1 = require("./structuredLogger");
(0, vitest_1.describe)('createStructuredLogger', () => {
    (0, vitest_1.it)('emits structured severity and correlation data', () => {
        const sink = vitest_1.vi.fn();
        const logger = (0, structuredLogger_1.createStructuredLogger)({
            serviceName: 'api-service',
            serviceRole: 'api',
        }, sink).child({
            correlationId: 'corr-123',
        });
        logger.info('auth.login.succeeded', {
            actorId: 'user-1',
        });
        (0, vitest_1.expect)(sink).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(sink.mock.calls[0]?.[0]).toMatchObject({
            severity: 'info',
            event: 'auth.login.succeeded',
            serviceName: 'api-service',
            serviceRole: 'api',
            correlationId: 'corr-123',
            actorId: 'user-1',
        });
    });
});
