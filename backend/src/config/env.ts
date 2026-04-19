export type ServiceRole = 'api' | 'worker';
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
  return {
    serviceRole,
    nodeEnv: source.TAGWISE_NODE_ENV?.trim() || 'development',
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

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  return raw.trim().toLowerCase() === 'true';
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
