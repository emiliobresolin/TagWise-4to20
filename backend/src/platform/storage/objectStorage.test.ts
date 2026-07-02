import type { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import type { ObjectStorageConfig } from '../../config/env';
import {
  createS3EvidenceObjectStorageClient,
  runObjectStorageBootstrapSmoke,
  S3EvidenceObjectStorageClient,
  type ObjectStorageSmokeClient,
} from './objectStorage';

describe('runObjectStorageBootstrapSmoke', () => {
  it('verifies the bucket through a put and delete smoke cycle', async () => {
    const calls: string[] = [];

    const client: ObjectStorageSmokeClient = {
      async ensureBucket() {
        calls.push('ensureBucket');
      },
      async putTextObject(key, body) {
        calls.push(`put:${key}:${body}`);
      },
      async deleteObject(key) {
        calls.push(`delete:${key}`);
      },
    };

    const summary = await runObjectStorageBootstrapSmoke(
      client,
      'tagwise-evidence-dev',
      () => new Date('2026-04-18T12:00:00.000Z'),
    );

    expect(summary).toEqual({
      bucket: 'tagwise-evidence-dev',
      objectKey: 'bootstrap/2026-04-18T12:00:00.000Z.txt',
    });
    expect(calls).toEqual([
      'ensureBucket',
      'put:bootstrap/2026-04-18T12:00:00.000Z.txt:tagwise backend bootstrap smoke',
      'delete:bootstrap/2026-04-18T12:00:00.000Z.txt',
    ]);
  });
});

describe('createS3EvidenceObjectStorageClient', () => {
  const baseConfig: ObjectStorageConfig = {
    bucket: 'tagwise-evidence-dev',
    region: 'us-east-1',
    endpoint: 'http://127.0.0.1:9000',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    forcePathStyle: true,
    autoCreateBucket: true,
  };

  it('presigns upload and download URLs against the public endpoint when one is configured', async () => {
    const client = createS3EvidenceObjectStorageClient({
      ...baseConfig,
      publicEndpoint: 'http://192.168.0.50:9000',
    });

    const upload = await client.createBinaryUploadAuthorization({
      objectKey: 'evidence/photo.jpg',
      contentType: 'image/jpeg',
      expiresInSeconds: 300,
    });
    const download = await client.createBinaryAccessAuthorization({
      objectKey: 'evidence/photo.jpg',
      expiresInSeconds: 300,
    });

    expect(upload.uploadUrl).toContain(
      'http://192.168.0.50:9000/tagwise-evidence-dev/evidence/photo.jpg',
    );
    expect(upload.uploadMethod).toBe('PUT');
    expect(upload.requiredHeaders).toEqual({ 'content-type': 'image/jpeg' });
    expect(download.downloadUrl).toContain(
      'http://192.168.0.50:9000/tagwise-evidence-dev/evidence/photo.jpg',
    );
    expect(download.downloadMethod).toBe('GET');
  });

  it('presigns against the internal endpoint when no public endpoint is configured', async () => {
    const client = createS3EvidenceObjectStorageClient(baseConfig);

    const upload = await client.createBinaryUploadAuthorization({
      objectKey: 'evidence/photo.jpg',
      contentType: 'image/jpeg',
      expiresInSeconds: 300,
    });

    expect(upload.uploadUrl).toContain(
      'http://127.0.0.1:9000/tagwise-evidence-dev/evidence/photo.jpg',
    );
  });

  it('keeps internal S3 operations on the internal client when a presign client is provided', async () => {
    const internalSend = vi.fn().mockResolvedValue({
      ContentLength: 2048,
      ContentType: 'image/jpeg',
    });
    const presignSend = vi.fn();
    const client = new S3EvidenceObjectStorageClient(
      { send: internalSend } as unknown as S3Client,
      baseConfig,
      { send: presignSend } as unknown as S3Client,
    );

    const metadata = await client.getObjectMetadata('evidence/photo.jpg');

    expect(metadata).toEqual({
      contentLengthBytes: 2048,
      contentType: 'image/jpeg',
    });
    expect(internalSend).toHaveBeenCalledTimes(1);
    expect(presignSend).not.toHaveBeenCalled();
  });
});
