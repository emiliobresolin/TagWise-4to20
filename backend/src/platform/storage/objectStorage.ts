import {
  type BucketLocationConstraint,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { ObjectStorageConfig } from '../../config/env';

export interface ObjectStorageSmokeClient {
  ensureBucket(): Promise<void>;
  putTextObject(key: string, body: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

export interface EvidenceBinaryUploadAuthorization {
  uploadUrl: string;
  uploadMethod: 'PUT';
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface EvidenceBinaryAccessAuthorization {
  downloadUrl: string;
  downloadMethod: 'GET';
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface EvidenceStoredObjectMetadata {
  contentLengthBytes: number | null;
  contentType: string | null;
}

export interface EvidenceObjectStorageClient {
  createBinaryUploadAuthorization(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<EvidenceBinaryUploadAuthorization>;
  createBinaryAccessAuthorization(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<EvidenceBinaryAccessAuthorization>;
  getObjectMetadata(objectKey: string): Promise<EvidenceStoredObjectMetadata | null>;
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

export class S3EvidenceObjectStorageClient implements EvidenceObjectStorageClient {
  constructor(
    private readonly client: S3Client,
    private readonly config: ObjectStorageConfig,
  ) {}

  async createBinaryUploadAuthorization(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<EvidenceBinaryUploadAuthorization> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
    });
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();

    return {
      uploadUrl,
      uploadMethod: 'PUT',
      requiredHeaders: {
        'content-type': input.contentType,
      },
      expiresAt,
    };
  }

  async getObjectMetadata(objectKey: string): Promise<EvidenceStoredObjectMetadata | null> {
    try {
      const metadata = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: objectKey,
        }),
      );

      return {
        contentLengthBytes:
          typeof metadata.ContentLength === 'number' ? metadata.ContentLength : null,
        contentType: metadata.ContentType ?? null,
      };
    } catch {
      return null;
    }
  }

  async createBinaryAccessAuthorization(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<EvidenceBinaryAccessAuthorization> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: input.objectKey,
    });

    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds,
    });
    const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();

    return {
      downloadUrl,
      downloadMethod: 'GET',
      requiredHeaders: {},
      expiresAt,
    };
  }
}

export function createS3ObjectStorageClient(config: ObjectStorageConfig): S3ObjectStorageSmokeClient {
  return new S3ObjectStorageSmokeClient(createS3Client(config), config);
}

export function createS3EvidenceObjectStorageClient(
  config: ObjectStorageConfig,
): S3EvidenceObjectStorageClient {
  return new S3EvidenceObjectStorageClient(createS3Client(config), config);
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

function createS3Client(config: ObjectStorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
