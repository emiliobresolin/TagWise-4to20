import { describe, expect, it } from 'vitest';

const liveApiBaseUrl = process.env.TAGWISE_LIVE_API_BASE_URL?.replace(/\/$/, '');
const describeLive = liveApiBaseUrl ? describe : describe.skip;

describeLive('TagWise live API smoke workflow', () => {
  it('supports the connected mobile backend path against a running API server', async () => {
    const baseUrl = requireLiveApiBaseUrl();

    const live = await getJson<{ serviceName: string; status: string }>(baseUrl, '/health/live');
    expect(live.response.status).toBe(200);
    expect(live.body.serviceName).toBe('api-service');

    const ready = await getJson<{ ready: boolean; checks: { database: string } }>(
      baseUrl,
      '/health/ready',
    );
    expect(ready.response.status).toBe(200);
    expect(ready.body).toMatchObject({
      ready: true,
      checks: { database: 'ready' },
    });

    const metrics = await getJson<{ requestCount: number; errorCount: number }>(baseUrl, '/metrics');
    expect(metrics.response.status).toBe(200);
    expect(metrics.body.requestCount).toBeGreaterThanOrEqual(0);
    expect(metrics.body.errorCount).toBeGreaterThanOrEqual(0);

    const missingPassword = await postJson<{ message: string }>(baseUrl, '/auth/login', {
      email: 'tech@tagwise.local',
    });
    expect(missingPassword.response.status).toBe(400);
    expect(missingPassword.body.message).toBe('email and password are required.');

    const unauthenticatedPackages = await fetch(`${baseUrl}/work-packages`);
    expect(unauthenticatedPackages.status).toBe(401);

    const technicianLogin = await login(baseUrl, 'tech@tagwise.local');
    expect(technicianLogin.body.user.role).toBe('technician');

    const refreshed = await postJson<AuthSessionResponse>(baseUrl, '/auth/refresh', {
      refreshToken: technicianLogin.body.tokens.refreshToken,
    });
    expect(refreshed.response.status).toBe(200);
    expect(refreshed.body.user.role).toBe('technician');

    const technicianAuth = authHeaders(technicianLogin.body.tokens.accessToken);
    const packages = await getJson<{
      items: Array<{ id: string; tagCount: number; snapshotContractVersion: string }>;
    }>(baseUrl, '/work-packages', technicianAuth);
    expect(packages.response.status).toBe(200);
    expect(packages.body.items.length).toBeGreaterThan(0);

    const workPackageId = packages.body.items[0]?.id;
    expect(workPackageId).toBeTruthy();

    const snapshot = await getJson<{
      contractVersion: string;
      summary: { id: string };
      tags: unknown[];
      templates: unknown[];
      guidance: unknown[];
      historySummaries: unknown[];
    }>(baseUrl, `/work-packages/${encodeURIComponent(workPackageId ?? '')}/download`, technicianAuth);
    expect(snapshot.response.status).toBe(200);
    expect(snapshot.body.summary.id).toBe(workPackageId);
    expect(snapshot.body.tags.length).toBeGreaterThan(0);
    expect(snapshot.body.templates.length).toBeGreaterThan(0);
    expect(snapshot.body.guidance.length).toBeGreaterThan(0);
    expect(snapshot.body.historySummaries.length).toBeGreaterThan(0);

    const supervisorLogin = await login(baseUrl, 'supervisor@tagwise.local');
    expect(supervisorLogin.body.user.role).toBe('supervisor');
    const supervisorQueue = await getJson<{ items: unknown[] }>(
      baseUrl,
      '/review/supervisor/reports',
      authHeaders(supervisorLogin.body.tokens.accessToken),
    );
    expect(supervisorQueue.response.status).toBe(200);
    expect(Array.isArray(supervisorQueue.body.items)).toBe(true);

    const managerLogin = await login(baseUrl, 'manager@tagwise.local');
    expect(managerLogin.body.user.role).toBe('manager');
    const managerQueue = await getJson<{ items: unknown[] }>(
      baseUrl,
      '/review/manager/reports',
      authHeaders(managerLogin.body.tokens.accessToken),
    );
    expect(managerQueue.response.status).toBe(200);
    expect(Array.isArray(managerQueue.body.items)).toBe(true);
  }, 30_000);
});

interface AuthSessionResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

function requireLiveApiBaseUrl() {
  if (!liveApiBaseUrl) {
    throw new Error('TAGWISE_LIVE_API_BASE_URL is required for live API smoke tests.');
  }

  return liveApiBaseUrl;
}

async function login(baseUrl: string, email: string) {
  const result = await postJson<AuthSessionResponse>(baseUrl, '/auth/login', {
    email,
    password: 'TagWise123!',
  });

  expect(result.response.status).toBe(200);
  expect(result.body.tokens.accessToken).toBeTruthy();
  expect(result.body.tokens.refreshToken).toBeTruthy();

  return result;
}

function authHeaders(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

async function getJson<T>(baseUrl: string, path: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers,
  });
  const body = (await response.json()) as T;

  return { response, body };
}

async function postJson<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const responseBody = (await response.json()) as T;

  return { response, body: responseBody };
}
