import { loadServiceEnvironment, type ServiceEnvironment } from '../config/env';

export interface DeploymentPreflightServiceSummary {
  role: ServiceEnvironment['serviceRole'];
  host: string;
  port: number;
}

export interface DeploymentPreflightReport {
  deploymentEnvironment: ServiceEnvironment['deploymentEnvironment'];
  nodeEnv: string;
  services: DeploymentPreflightServiceSummary[];
  database: {
    configured: true;
    redactedUrl: string;
  };
  objectStorage: {
    bucket: string;
    region: string;
    endpointConfigured: boolean;
    forcePathStyle: boolean;
    autoCreateBucket: boolean;
  };
  secrets: {
    source: 'environment';
    valuesRedacted: true;
  };
}

export function buildDeploymentPreflightReport(
  source: NodeJS.ProcessEnv = process.env,
): DeploymentPreflightReport {
  const apiEnvironment = loadServiceEnvironment('api', source);
  const workerEnvironment = loadServiceEnvironment('worker', source);

  if (apiEnvironment.deploymentEnvironment !== workerEnvironment.deploymentEnvironment) {
    throw new Error('API and worker deployment environments must match.');
  }

  return {
    deploymentEnvironment: apiEnvironment.deploymentEnvironment,
    nodeEnv: apiEnvironment.nodeEnv,
    services: [
      summarizeService(apiEnvironment),
      summarizeService(workerEnvironment),
    ],
    database: {
      configured: true,
      redactedUrl: redactDatabaseUrl(apiEnvironment.databaseUrl),
    },
    objectStorage: {
      bucket: apiEnvironment.objectStorage.bucket,
      region: apiEnvironment.objectStorage.region,
      endpointConfigured: Boolean(apiEnvironment.objectStorage.endpoint),
      forcePathStyle: apiEnvironment.objectStorage.forcePathStyle,
      autoCreateBucket: apiEnvironment.objectStorage.autoCreateBucket,
    },
    secrets: {
      source: 'environment',
      valuesRedacted: true,
    },
  };
}

function summarizeService(environment: ServiceEnvironment): DeploymentPreflightServiceSummary {
  return {
    role: environment.serviceRole,
    host: environment.host,
    port: environment.port,
  };
}

function redactDatabaseUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.username) {
      parsed.username = '***';
    }
    if (parsed.password) {
      parsed.password = '***';
    }

    return parsed.toString();
  } catch {
    return '<redacted>';
  }
}
