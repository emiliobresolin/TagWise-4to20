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
) => Promise<{
  status: number;
  ok: boolean;
  text(): Promise<string>;
}>;

const smokePaths = ['/health/live', '/health/ready', '/metrics'] as const;

export async function runReleaseSmoke(
  targets: ReleaseSmokeTarget[],
  fetcher: ReleaseSmokeFetch = fetch,
): Promise<ReleaseSmokeCheck[]> {
  const checks: ReleaseSmokeCheck[] = [];

  for (const target of targets) {
    for (const path of smokePaths) {
      const url = new URL(path, normalizeBaseUrl(target.baseUrl));
      const response = await fetcher(url.toString());
      await response.text();
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
