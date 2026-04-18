import {
  type BucketLocationConstraint,
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type { ObjectStorageConfig } from '../../config/env';

export interface ObjectStorageSmokeClient {
  ensureBucket(): Promise<void>;
  putTextObject(key: string, body: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

export interface ObjectStorageSmokeSummary {
  bucket: string;
  objectKey: string;
}

export class S3ObjectStorageSmokeClient implements ObjectStorageSmokeClient {
  constructor(
    private readonly client: S3Client,
    private readonly config: ObjectStorageConfig,
  ) {}

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return;
    } catch (error) {
      if (!this.config.autoCreateBucket) {
        throw error;
      }
    }

    const command =
      !this.config.endpoint && this.config.region !== 'us-east-1'
        ? new CreateBucketCommand({
            Bucket: this.config.bucket,
            CreateBucketConfiguration: {
              LocationConstraint: this.config.region as BucketLocationConstraint,
            },
          })
        : new CreateBucketCommand({
            Bucket: this.config.bucket,
          });

    await this.client.send(command);
  }

  async putTextObject(key: string, body: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }),
    );
  }
}

export function createS3ObjectStorageClient(config: ObjectStorageConfig): S3ObjectStorageSmokeClient {
  return new S3ObjectStorageSmokeClient(
    new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
    config,
  );
}

export async function runObjectStorageBootstrapSmoke(
  client: ObjectStorageSmokeClient,
  bucket: string,
  now: () => Date = () => new Date(),
): Promise<ObjectStorageSmokeSummary> {
  const objectKey = `bootstrap/${now().toISOString()}.txt`;

  await client.ensureBucket();
  await client.putTextObject(objectKey, 'tagwise backend bootstrap smoke');
  await client.deleteObject(objectKey);

  return {
    bucket,
    objectKey,
  };
}
