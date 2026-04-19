import { afterEach, describe, expect, it, vi } from 'vitest';

import { createStructuredLogger } from '../platform/diagnostics/structuredLogger';
import { createServiceRuntime, type ServiceRuntimeHandle } from './serviceRuntime';

const runtimes: ServiceRuntimeHandle[] = [];

afterEach(async () => {
  while (runtimes.length > 0) {
    const runtime = runtimes.pop();
    if (runtime) {
      await runtime.stop();
    }
  }
});

describe('createServiceRuntime', () => {
  it('boots API and worker runtimes independently with readiness endpoints', async () => {
    const api = createServiceRuntime({
      serviceName: 'api-service',
      serviceRole: 'api',
      host: '127.0.0.1',
      port: 0,
      verifyDatabaseReadiness: async () => undefined,
    });
    const worker = createServiceRuntime({
      serviceName: 'worker-service',
      serviceRole: 'worker',
      host: '127.0.0.1',
      port: 0,
      verifyDatabaseReadiness: async () => undefined,
    });

    runtimes.push(api, worker);

    const apiBinding = await api.start();
    const workerBinding = await worker.start();

    const apiReady = await fetch(`http://127.0.0.1:${apiBinding.port}/health/ready`);
    const workerReady = await fetch(`http://127.0.0.1:${workerBinding.port}/health/ready`);
    const apiMetrics = await fetch(`http://127.0.0.1:${apiBinding.port}/metrics`);

    expect(apiReady.status).toBe(200);
    expect(workerReady.status).toBe(200);
    expect((await apiReady.json()).serviceName).toBe('api-service');
    expect((await workerReady.json()).serviceName).toBe('worker-service');
    expect((await apiMetrics.json())).toMatchObject({
      requestCount: expect.any(Number),
      errorCount: expect.any(Number),
      errorRate: expect.any(Number),
      uptimeMs: expect.any(Number),
    });
  });

  it('reports readiness failure when database verification fails', async () => {
    const api = createServiceRuntime({
      serviceName: 'api-service',
      serviceRole: 'api',
      host: '127.0.0.1',
      port: 0,
      verifyDatabaseReadiness: async () => {
        throw new Error('database unavailable');
      },
    });

    runtimes.push(api);

    const binding = await api.start();
    const ready = await fetch(`http://127.0.0.1:${binding.port}/health/ready`);
    const body = (await ready.json()) as { ready: boolean; lastError?: string };

    expect(ready.status).toBe(503);
    expect(body.ready).toBe(false);
    expect(body.lastError).toContain('database unavailable');
  });

  it('captures correlation-aware request failures without double-counting error metrics', async () => {
    const sink = vi.fn();
    const runtime = createServiceRuntime({
      serviceName: 'api-service',
      serviceRole: 'api',
      host: '127.0.0.1',
      port: 0,
      verifyDatabaseReadiness: async () => undefined,
      logger: createStructuredLogger(
        {
          serviceName: 'api-service',
          serviceRole: 'api',
        },
        sink,
      ),
      handleRequest: async (request) => {
        if (request.url === '/boom') {
          throw new Error('forced request failure');
        }

        return false;
      },
    });

    runtimes.push(runtime);

    const binding = await runtime.start();
    const failing = await fetch(`http://127.0.0.1:${binding.port}/boom`, {
      headers: {
        'x-correlation-id': 'corr-boom-test',
      },
    });
    const metrics = await fetch(`http://127.0.0.1:${binding.port}/metrics`);
    const metricsBody = (await metrics.json()) as {
      requestCount: number;
      errorCount: number;
      errorRate: number;
    };
    const errorLog = sink.mock.calls.find(
      (call) => call[0]?.event === 'http.request.failed',
    )?.[0] as Record<string, unknown> | undefined;

    expect(failing.status).toBe(500);
    expect(failing.headers.get('x-correlation-id')).toBe('corr-boom-test');
    expect(metricsBody).toMatchObject({
      requestCount: 1,
      errorCount: 1,
      errorRate: 1,
    });
    expect(errorLog).toMatchObject({
      severity: 'error',
      event: 'http.request.failed',
      correlationId: 'corr-boom-test',
    });
  });
});
