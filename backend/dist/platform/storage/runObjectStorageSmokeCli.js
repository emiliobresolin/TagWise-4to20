"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../../config/env");
const objectStorage_1 = require("./objectStorage");
async function main() {
    const environment = (0, env_1.loadServiceEnvironment)('worker');
    const storageClient = (0, objectStorage_1.createS3ObjectStorageClient)(environment.objectStorage);
    const summary = await (0, objectStorage_1.runObjectStorageBootstrapSmoke)(storageClient, environment.objectStorage.bucket);
    console.log(JSON.stringify({
        level: 'info',
        event: 'storage.smoke.completed',
        bucket: summary.bucket,
        objectKey: summary.objectKey,
    }, null, 2));
}
void main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown object storage smoke error';
    console.error(JSON.stringify({ level: 'error', event: 'storage.smoke.failed', message }, null, 2));
    process.exitCode = 1;
});
