"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadServiceEnvironment = loadServiceEnvironment;
function loadServiceEnvironment(serviceRole, source = process.env) {
    return {
        serviceRole,
        nodeEnv: source.TAGWISE_NODE_ENV?.trim() || 'development',
        host: source.TAGWISE_HOST?.trim() || '127.0.0.1',
        port: parsePort(serviceRole === 'api' ? source.TAGWISE_API_PORT : source.TAGWISE_WORKER_PORT, serviceRole === 'api' ? 4100 : 4101, serviceRole),
        databaseUrl: requireValue(source.TAGWISE_DATABASE_URL, 'TAGWISE_DATABASE_URL'),
        objectStorage: {
            bucket: requireValue(source.TAGWISE_STORAGE_BUCKET, 'TAGWISE_STORAGE_BUCKET'),
            region: source.TAGWISE_STORAGE_REGION?.trim() || 'us-east-1',
            endpoint: optionalValue(source.TAGWISE_STORAGE_ENDPOINT),
            accessKeyId: requireValue(source.TAGWISE_STORAGE_ACCESS_KEY_ID, 'TAGWISE_STORAGE_ACCESS_KEY_ID'),
            secretAccessKey: requireValue(source.TAGWISE_STORAGE_SECRET_ACCESS_KEY, 'TAGWISE_STORAGE_SECRET_ACCESS_KEY'),
            forcePathStyle: parseBoolean(source.TAGWISE_STORAGE_FORCE_PATH_STYLE, false),
            autoCreateBucket: parseBoolean(source.TAGWISE_STORAGE_AUTO_CREATE_BUCKET, false),
        },
    };
}
function requireValue(value, key) {
    if (!value || value.trim().length === 0) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value.trim();
}
function optionalValue(value) {
    if (!value || value.trim().length === 0) {
        return undefined;
    }
    return value.trim();
}
function parsePort(raw, fallback, serviceRole) {
    if (!raw || raw.trim().length === 0) {
        return fallback;
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`Invalid port for ${serviceRole}: ${raw}`);
    }
    return value;
}
function parseBoolean(raw, fallback) {
    if (!raw || raw.trim().length === 0) {
        return fallback;
    }
    return raw.trim().toLowerCase() === 'true';
}
