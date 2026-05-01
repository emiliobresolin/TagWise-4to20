export interface ReleaseSmokeTarget {
  name: string;
  baseUrl: string;
}

export interface ReleaseSmokeCheck {
  target: string;
  path: string;
  status: number;
  ok: boolean;
}

export type ReleaseSmokeFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  status: number;
  ok: boolean;
  text(): Promise<string>;
}>;

export interface ReleaseSmokeOptions {
  timeoutMs?: number;
}

const smokePaths = ['/health/live', '/health/ready', '/metrics'] as const;
const defaultSmokeTimeoutMs = 5000;

export async function runReleaseSmoke(
  targets: ReleaseSmokeTarget[],
  fetcher: ReleaseSmokeFetch = fetch,
  options: ReleaseSmokeOptions = {},
): Promise<ReleaseSmokeCheck[]> {
  const checks: ReleaseSmokeCheck[] = [];
  const timeoutMs = options.timeoutMs ?? defaultSmokeTimeoutMs;

  for (const target of targets) {
    for (const path of smokePaths) {
      const url = new URL(path, normalizeBaseUrl(target.baseUrl));
      let response: Awaited<ReturnType<ReleaseSmokeFetch>>;
      try {
        response = await fetchWithTimeout(url.toString(), fetcher, timeoutMs);
        await response.text();
      } catch (error) {
        throw new Error(
          `Release smoke request failed for ${target.name}${path}: ${formatSmokeError(error)}`,
        );
      }
      checks.push({
        target: target.name,
        path,
        status: response.status,
        ok: response.ok,
      });
    }
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    throw new Error(
      `Release smoke failed for ${failed
        .map((check) => `${check.target}${check.path}:${check.status}`)
        .join(', ')}`,
    );
  }

  return checks;
}

export function buildReleaseSmokeTargets(
  source: NodeJS.ProcessEnv = process.env,
): ReleaseSmokeTarget[] {
  const host = normalizeHostForHttp(source.TAGWISE_HOST?.trim() || '127.0.0.1');
  const apiPort = source.TAGWISE_API_PORT?.trim() || '4100';
  const workerPort = source.TAGWISE_WORKER_PORT?.trim() || '4101';

  return [
    {
      name: 'api',
      baseUrl: source.TAGWISE_API_BASE_URL?.trim() || `http://${host}:${apiPort}`,
    },
    {
      name: 'worker',
      baseUrl: source.TAGWISE_WORKER_BASE_URL?.trim() || `http://${host}:${workerPort}`,
    },
  ];
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function normalizeHostForHttp(host: string): string {
  return host === '0.0.0.0' ? '127.0.0.1' : host;
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
      throw new Error(`timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function formatSmokeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
