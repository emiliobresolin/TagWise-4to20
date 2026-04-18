"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3ObjectStorageSmokeClient = void 0;
exports.createS3ObjectStorageClient = createS3ObjectStorageClient;
exports.runObjectStorageBootstrapSmoke = runObjectStorageBootstrapSmoke;
const client_s3_1 = require("@aws-sdk/client-s3");
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
function createS3ObjectStorageClient(config) {
    return new S3ObjectStorageSmokeClient(new client_s3_1.S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    }), config);
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
