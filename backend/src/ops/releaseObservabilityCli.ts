import { loadServiceEnvironment } from '../config/env';
import { createPostgresPool } from '../platform/db/postgres';
import { buildReleaseSmokeTargets, type ReleaseSmokeFetch } from './releaseSmoke';
import {
  buildReleaseDashboard,
  buildReleaseObservabilitySnapshot,
  evaluateReleaseAlerts,
  type ServiceMetricsSignal,
} from './releaseObservability';

async function main() {
  const environment = loadServiceEnvironment('api');
  const pool = createPostgresPool(environment);

  try {
    const serviceSignals = await readReleaseServiceSignals(buildReleaseSmokeTargets());
    const snapshot = await buildReleaseObservabilitySnapshot({
      database: pool,
      apiMetrics: serviceSignals.api,
      workerMetrics: serviceSignals.worker,
    });
    const alerts = evaluateReleaseAlerts(snapshot);
    const dashboard = buildReleaseDashboard(snapshot, alerts);

    console.log(
      JSON.stringify(
        {
          level: alerts.some((alert) => alert.severity === 'critical') ? 'warn' : 'info',
          event: 'release.observability.completed',
          snapshot,
          dashboard,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

export async function readReleaseServiceSignals(
  targets = buildReleaseSmokeTargets(),
  fetcher: ReleaseSmokeFetch = fetch,
  timeoutMs: number = 5000,
): Promise<{ api: ServiceMetricsSignal; worker: ServiceMetricsSignal }> {
  const entries = await Promise.all(
    targets.map(async (target) => [
      target.name,
      await readServiceSignal(target.baseUrl, fetcher, timeoutMs),
    ] as const),
  );
  const signals = Object.fromEntries(entries) as Record<string, ServiceMetricsSignal>;

  return {
    api: signals.api ?? emptyFailedSignal('API release target was not configured.'),
    worker: signals.worker ?? emptyFailedSignal('Worker release target was not configured.'),
  };
}

async function readServiceSignal(
  baseUrl: string,
  fetcher: ReleaseSmokeFetch,
  timeoutMs: number,
): Promise<ServiceMetricsSignal> {
  try {
    const [ready, metrics] = await Promise.all([
      fetchJson<Record<string, unknown>>(new URL('/health/ready', normalizeBaseUrl(baseUrl)), fetcher, timeoutMs),
      fetchJson<Record<string, unknown>>(new URL('/metrics', normalizeBaseUrl(baseUrl)), fetcher, timeoutMs),
    ]);

    return {
      ready: ready.ready === true,
      errorCount:
        typeof metrics.errorCount === 'number'
          ? metrics.errorCount
          : readNestedMetric(ready.metrics, 'errorCount'),
      errorRate:
        typeof metrics.errorRate === 'number'
          ? metrics.errorRate
          : readNestedMetric(ready.metrics, 'errorRate'),
    };
  } catch (error) {
    return emptyFailedSignal(error instanceof Error ? error.message : 'Service signal unavailable.');
  }
}

async function fetchJson<T>(
  url: URL,
  fetcher: ReleaseSmokeFetch,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchWithTimeout(url.toString(), fetcher, timeoutMs);
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : {};

  if (!response.ok) {
    throw new Error(`${url.pathname} returned ${response.status}`);
  }

  return data as T;
}

async function fetchWithTimeout(
  url: string,
  fetcher: ReleaseSmokeFetch,
  timeoutMs: number,
): ReturnType<ReleaseSmokeFetch> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetcher(url, { signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      throw new Error(`${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function readNestedMetric(value: unknown, key: 'errorCount' | 'errorRate'): number | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const metrics = value as Record<string, unknown>;
  return typeof metrics[key] === 'number' ? metrics[key] : null;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function emptyFailedSignal(lastError: string): ServiceMetricsSignal {
  return {
    ready: false,
    errorCount: null,
    errorRate: null,
    lastError,
  };
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown release observability error';
  console.error(
    JSON.stringify(
      {
        level: 'error',
        event: 'release.observability.failed',
        message,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
