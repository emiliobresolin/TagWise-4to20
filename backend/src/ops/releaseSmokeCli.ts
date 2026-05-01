import { buildReleaseSmokeTargets, runReleaseSmoke } from './releaseSmoke';

void runReleaseSmoke(buildReleaseSmokeTargets())
  .then((checks) => {
    console.log(
      JSON.stringify(
        {
          level: 'info',
          event: 'release.smoke.completed',
          checks,
        },
        null,
        2,
      ),
    );
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown release smoke error';
    console.error(
      JSON.stringify(
        {
          level: 'error',
          event: 'release.smoke.failed',
          message,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  });
