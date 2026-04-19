import { describe, expect, it, vi } from 'vitest';

import { createStructuredLogger } from './structuredLogger';

describe('createStructuredLogger', () => {
  it('emits structured severity and correlation data', () => {
    const sink = vi.fn();
    const logger = createStructuredLogger(
      {
        serviceName: 'api-service',
        serviceRole: 'api',
      },
      sink,
    ).child({
      correlationId: 'corr-123',
    });

    logger.info('auth.login.succeeded', {
      actorId: 'user-1',
    });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]?.[0]).toMatchObject({
      severity: 'info',
      event: 'auth.login.succeeded',
      serviceName: 'api-service',
      serviceRole: 'api',
      correlationId: 'corr-123',
      actorId: 'user-1',
    });
  });
});
