import { describe, expect, it, vi } from 'vitest';

import { runObjectStorageBootstrapSmoke, type ObjectStorageSmokeClient } from './objectStorage';

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
