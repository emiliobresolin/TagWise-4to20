import { afterEach, describe, expect, it } from 'vitest';

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

    expect(apiReady.status).toBe(200);
    expect(workerReady.status).toBe(200);
    expect((await apiReady.json()).serviceName).toBe('api-service');
    expect((await workerReady.json()).serviceName).toBe('worker-service');
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
});
