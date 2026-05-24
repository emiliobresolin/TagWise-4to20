"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3EvidenceObjectStorageClient = exports.S3ObjectStorageSmokeClient = void 0;
exports.createS3ObjectStorageClient = createS3ObjectStorageClient;
exports.createS3EvidenceObjectStorageClient = createS3EvidenceObjectStorageClient;
exports.runObjectStorageBootstrapSmoke = runObjectStorageBootstrapSmoke;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
class S3ObjectStorageSmokeClient {
    client;
    config;
    constructor(client, config) {
        this.client = client;
        this.config = config;
    }
    async ensureBucket() {
        try {
            await this.client.send(new client_s3_1.HeadBucketCommand({ Bucket: this.config.bucket }));
            return;
        }
        catch (error) {
            if (!this.config.autoCreateBucket) {
                throw error;
            }
        }
        const command = !this.config.endpoint && this.config.region !== 'us-east-1'
            ? new client_s3_1.CreateBucketCommand({
                Bucket: this.config.bucket,
                CreateBucketConfiguration: {
                    LocationConstraint: this.config.region,
                },
            })
            : new client_s3_1.CreateBucketCommand({
                Bucket: this.config.bucket,
            });
        await this.client.send(command);
    }
    async putTextObject(key, body) {
        await this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Body: body,
            ContentType: 'text/plain; charset=utf-8',
        }));
    }
    async deleteObject(key) {
        await this.client.send(new client_s3_1.DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
        }));
    }
}
exports.S3ObjectStorageSmokeClient = S3ObjectStorageSmokeClient;
class S3EvidenceObjectStorageClient {
    client;
    config;
    constructor(client, config) {
        this.client = client;
        this.config = config;
    }
    async createBinaryUploadAuthorization(input) {
        const command = new client_s3_1.PutObjectCommand({
            Bucket: this.config.bucket,
            Key: input.objectKey,
            ContentType: input.contentType,
        });
        const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, command, {
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
    async getObjectMetadata(objectKey) {
        try {
            const metadata = await this.client.send(new client_s3_1.HeadObjectCommand({
                Bucket: this.config.bucket,
                Key: objectKey,
            }));
            return {
                contentLengthBytes: typeof metadata.ContentLength === 'number' ? metadata.ContentLength : null,
                contentType: metadata.ContentType ?? null,
            };
        }
        catch {
            return null;
        }
    }
    async createBinaryAccessAuthorization(input) {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.config.bucket,
            Key: input.objectKey,
        });
        const downloadUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.client, command, {
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
exports.S3EvidenceObjectStorageClient = S3EvidenceObjectStorageClient;
function createS3ObjectStorageClient(config) {
    return new S3ObjectStorageSmokeClient(createS3Client(config), config);
}
function createS3EvidenceObjectStorageClient(config) {
    return new S3EvidenceObjectStorageClient(createS3Client(config), config);
}
async function runObjectStorageBootstrapSmoke(client, bucket, now = () => new Date()) {
    const objectKey = `bootstrap/${now().toISOString()}.txt`;
    await client.ensureBucket();
    await client.putTextObject(objectKey, 'tagwise backend bootstrap smoke');
    await client.deleteObject(objectKey);
    return {
        bucket,
        objectKey,
    };
}
function createS3Client(config) {
    return new client_s3_1.S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    });
}
