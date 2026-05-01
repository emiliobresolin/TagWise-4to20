export type ServiceRole = 'api' | 'worker';
export type DeploymentEnvironment = 'development' | 'staging' | 'production';
export type UserRole = 'technician' | 'supervisor' | 'manager';

export interface ObjectStorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  autoCreateBucket: boolean;
}

export interface ServiceEnvironment {
  serviceRole: ServiceRole;
  deploymentEnvironment: DeploymentEnvironment;
  nodeEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  objectStorage: ObjectStorageConfig;
  auth?: AuthConfig;
}

export interface SeedUserConfig {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

export interface AuthConfig {
  tokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  seedUsers: {
    technician: SeedUserConfig;
    supervisor: SeedUserConfig;
    manager: SeedUserConfig;
  };
}

export function loadServiceEnvironment(
  serviceRole: ServiceRole,
  source: NodeJS.ProcessEnv = process.env,
): ServiceEnvironment {
  const nodeEnv = source.TAGWISE_NODE_ENV?.trim() || 'development';
  const deploymentEnvironment = parseDeploymentEnvironment(
    source.TAGWISE_DEPLOYMENT_ENV,
    nodeEnv,
  );
  const environment: ServiceEnvironment = {
    serviceRole,
    deploymentEnvironment,
    nodeEnv,
    host: source.TAGWISE_HOST?.trim() || '127.0.0.1',
    port: parsePort(
      serviceRole === 'api' ? source.TAGWISE_API_PORT : source.TAGWISE_WORKER_PORT,
      serviceRole === 'api' ? 4100 : 4101,
      serviceRole,
    ),
    databaseUrl: requireValue(source.TAGWISE_DATABASE_URL, 'TAGWISE_DATABASE_URL'),
    objectStorage: {
      bucket: requireValue(source.TAGWISE_STORAGE_BUCKET, 'TAGWISE_STORAGE_BUCKET'),
      region: source.TAGWISE_STORAGE_REGION?.trim() || 'us-east-1',
      endpoint: optionalValue(source.TAGWISE_STORAGE_ENDPOINT),
      accessKeyId: requireValue(source.TAGWISE_STORAGE_ACCESS_KEY_ID, 'TAGWISE_STORAGE_ACCESS_KEY_ID'),
      secretAccessKey: requireValue(
        source.TAGWISE_STORAGE_SECRET_ACCESS_KEY,
        'TAGWISE_STORAGE_SECRET_ACCESS_KEY',
      ),
      forcePathStyle: parseBoolean(source.TAGWISE_STORAGE_FORCE_PATH_STYLE, false),
      autoCreateBucket: parseBoolean(source.TAGWISE_STORAGE_AUTO_CREATE_BUCKET, false),
    },
    auth: serviceRole === 'api' ? loadAuthConfig(source) : undefined,
  };

  assertReleaseSafeEnvironment(environment, source);

  return environment;
}

function loadAuthConfig(source: NodeJS.ProcessEnv): AuthConfig {
  return {
    tokenSecret: requireValue(source.TAGWISE_AUTH_TOKEN_SECRET, 'TAGWISE_AUTH_TOKEN_SECRET'),
    accessTokenTtlSeconds: parsePositiveInteger(
      source.TAGWISE_AUTH_ACCESS_TOKEN_TTL_SECONDS,
      900,
      'TAGWISE_AUTH_ACCESS_TOKEN_TTL_SECONDS',
    ),
    refreshTokenTtlSeconds: parsePositiveInteger(
      source.TAGWISE_AUTH_REFRESH_TOKEN_TTL_SECONDS,
      60 * 60 * 24 * 30,
      'TAGWISE_AUTH_REFRESH_TOKEN_TTL_SECONDS',
    ),
    seedUsers: {
      technician: {
        email:
          source.TAGWISE_SEED_TECHNICIAN_EMAIL?.trim() || 'tech@tagwise.local',
        password:
          source.TAGWISE_SEED_TECHNICIAN_PASSWORD?.trim() || 'TagWise123!',
        displayName:
          source.TAGWISE_SEED_TECHNICIAN_DISPLAY_NAME?.trim() || 'Field Technician',
        role: 'technician',
      },
      supervisor: {
        email:
          source.TAGWISE_SEED_SUPERVISOR_EMAIL?.trim() || 'supervisor@tagwise.local',
        password:
          source.TAGWISE_SEED_SUPERVISOR_PASSWORD?.trim() || 'TagWise123!',
        displayName:
          source.TAGWISE_SEED_SUPERVISOR_DISPLAY_NAME?.trim() || 'Field Supervisor',
        role: 'supervisor',
      },
      manager: {
        email:
          source.TAGWISE_SEED_MANAGER_EMAIL?.trim() || 'manager@tagwise.local',
        password:
          source.TAGWISE_SEED_MANAGER_PASSWORD?.trim() || 'TagWise123!',
        displayName:
          source.TAGWISE_SEED_MANAGER_DISPLAY_NAME?.trim() || 'Operations Manager',
        role: 'manager',
      },
    },
  };
}

function requireValue(value: string | undefined, key: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value.trim();
}

function optionalValue(value: string | undefined): string | undefined {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  return value.trim();
}

function parsePort(raw: string | undefined, fallback: number, serviceRole: ServiceRole): number {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`Invalid port for ${serviceRole}: ${raw}`);
  }

  return value;
}

function parseDeploymentEnvironment(
  raw: string | undefined,
  nodeEnv: string,
): DeploymentEnvironment {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return nodeEnv.trim().toLowerCase() === 'production' ? 'production' : 'development';
  }

  if (
    normalized === 'development' ||
    normalized === 'staging' ||
    normalized === 'production'
  ) {
    return normalized;
  }

  throw new Error(`Invalid deployment environment: ${raw}`);
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  return raw.trim().toLowerCase() === 'true';
}

function assertReleaseSafeEnvironment(
  environment: ServiceEnvironment,
  source: NodeJS.ProcessEnv,
): void {
  if (
    environment.deploymentEnvironment === 'development' &&
    environment.nodeEnv.trim().toLowerCase() === 'production'
  ) {
    throw new Error(
      'TAGWISE_NODE_ENV=production must not run with TAGWISE_DEPLOYMENT_ENV=development.',
    );
  }

  if (environment.deploymentEnvironment === 'development') {
    return;
  }

  if (environment.nodeEnv.trim().toLowerCase() !== 'production') {
    throw new Error('Release environments require TAGWISE_NODE_ENV=production.');
  }

  assertReleaseDatabaseUrl(environment.databaseUrl);
  assertReleaseConfiguredValue(environment.objectStorage.bucket, 'TAGWISE_STORAGE_BUCKET');
  assertReleaseConfiguredValue(environment.objectStorage.region, 'TAGWISE_STORAGE_REGION');
  if (environment.objectStorage.endpoint) {
    assertReleaseStorageEndpoint(environment.objectStorage.endpoint);
  }
  assertReleaseConfiguredValue(
    environment.objectStorage.accessKeyId,
    'TAGWISE_STORAGE_ACCESS_KEY_ID',
    ['minioadmin'],
  );
  assertReleaseConfiguredValue(
    environment.objectStorage.secretAccessKey,
    'TAGWISE_STORAGE_SECRET_ACCESS_KEY',
    ['minioadmin'],
  );

  if (environment.objectStorage.autoCreateBucket) {
    throw new Error('Release environments must not auto-create object storage buckets.');
  }

  if (environment.serviceRole !== 'api' || !environment.auth) {
    return;
  }

  assertReleaseConfiguredValue(
    source.TAGWISE_AUTH_TOKEN_SECRET,
    'TAGWISE_AUTH_TOKEN_SECRET',
    ['replace-me-in-real-environments', 'development-secret'],
    16,
  );
  assertReleaseConfiguredValue(
    source.TAGWISE_SEED_TECHNICIAN_EMAIL,
    'TAGWISE_SEED_TECHNICIAN_EMAIL',
    ['tech@tagwise.local'],
  );
  assertReleaseConfiguredValue(
    source.TAGWISE_SEED_TECHNICIAN_PASSWORD,
    'TAGWISE_SEED_TECHNICIAN_PASSWORD',
    ['TagWise123!'],
    16,
  );
  assertReleaseConfiguredValue(
    source.TAGWISE_SEED_SUPERVISOR_EMAIL,
    'TAGWISE_SEED_SUPERVISOR_EMAIL',
    ['supervisor@tagwise.local'],
  );
  assertReleaseConfiguredValue(
    source.TAGWISE_SEED_SUPERVISOR_PASSWORD,
    'TAGWISE_SEED_SUPERVISOR_PASSWORD',
    ['TagWise123!'],
    16,
  );
  assertReleaseConfiguredValue(
    source.TAGWISE_SEED_MANAGER_EMAIL,
    'TAGWISE_SEED_MANAGER_EMAIL',
    ['manager@tagwise.local'],
  );
  assertReleaseConfiguredValue(
    source.TAGWISE_SEED_MANAGER_PASSWORD,
    'TAGWISE_SEED_MANAGER_PASSWORD',
    ['TagWise123!'],
    16,
  );
}

function isLocalDatabaseUrl(databaseUrl: string): boolean {
  return /(@|\b)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(databaseUrl);
}

function assertReleaseDatabaseUrl(databaseUrl: string): void {
  assertNoReleasePlaceholder(databaseUrl, 'TAGWISE_DATABASE_URL');

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Release environments require a parseable PostgreSQL database URL.');
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('Release environments require a PostgreSQL database URL.');
  }

  assertReleaseConfiguredValue(parsed.hostname, 'TAGWISE_DATABASE_URL host');
  assertReleaseConfiguredValue(parsed.username, 'TAGWISE_DATABASE_URL username');
  assertReleaseConfiguredValue(parsed.password, 'TAGWISE_DATABASE_URL password');

  if (isLocalDatabaseUrl(databaseUrl) || isLocalHost(parsed.hostname)) {
    throw new Error(
      'Release environments must use a managed database URL, not localhost or 127.0.0.1.',
    );
  }

  if (parsed.username === 'tagwise' && parsed.password === 'tagwise') {
    throw new Error('Release environments must not use the development database credentials.');
  }
}

function assertReleaseStorageEndpoint(endpoint: string): void {
  assertNoReleasePlaceholder(endpoint, 'TAGWISE_STORAGE_ENDPOINT');

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('Release environments require a parseable object storage endpoint.');
  }

  if (isLocalHost(parsed.hostname)) {
    throw new Error('Release environments must not use a local object storage endpoint.');
  }
}

function isLocalHost(hostname: string): boolean {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal)$/i.test(hostname);
}

function assertReleaseConfiguredValue(
  raw: string | undefined,
  key: string,
  forbiddenValues: string[] = [],
  minimumLength = 1,
): void {
  const value = requireValue(raw, key);

  assertNoReleasePlaceholder(value, key);

  if (value.length < minimumLength || forbiddenValues.includes(value)) {
    throw new Error(`Release environments require a non-development value for ${key}.`);
  }
}

function assertNoReleasePlaceholder(value: string, key: string): void {
  if (/[<>]/.test(value) || /\b(set-in-secret-manager|placeholder|replace-me)\b/i.test(value)) {
    throw new Error(`Release environments require a real non-placeholder value for ${key}.`);
  }
}

function parsePositiveInteger(raw: string | undefined, fallback: number, key: string): number {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid positive integer for ${key}: ${raw}`);
  }

  return value;
}
