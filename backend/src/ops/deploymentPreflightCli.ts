import { buildDeploymentPreflightReport } from './deploymentPreflight';

try {
  console.log(
    JSON.stringify(
      {
        level: 'info',
        event: 'deployment.preflight.completed',
        report: buildDeploymentPreflightReport(),
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown deployment preflight error';
  console.error(
    JSON.stringify(
      {
        level: 'error',
        event: 'deployment.preflight.failed',
        message,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
