import { loadServiceEnvironment } from '../../config/env';
import { createS3ObjectStorageClient, runObjectStorageBootstrapSmoke } from './objectStorage';

async function main() {
  const environment = loadServiceEnvironment('worker');
  const storageClient = createS3ObjectStorageClient(environment.objectStorage);

  const summary = await runObjectStorageBootstrapSmoke(
    storageClient,
    environment.objectStorage.bucket,
  );

  console.log(
    JSON.stringify(
      {
        level: 'info',
        event: 'storage.smoke.completed',
        bucket: summary.bucket,
        objectKey: summary.objectKey,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown object storage smoke error';
  console.error(JSON.stringify({ level: 'error', event: 'storage.smoke.failed', message }, null, 2));
  process.exitCode = 1;
});
