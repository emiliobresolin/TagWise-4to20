"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issueTokenPair = issueTokenPair;
exports.verifyRefreshToken = verifyRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
const node_crypto_1 = require("node:crypto");
const model_1 = require("./model");
function issueTokenPair(user, sessionVersion, config, now = new Date()) {
    const issuedAtSeconds = toEpochSeconds(now);
    const accessExp = issuedAtSeconds + config.accessTokenTtlSeconds;
    const refreshExp = issuedAtSeconds + config.refreshTokenTtlSeconds;
    const accessToken = signToken({
        sub: user.id,
        role: user.role,
        typ: 'access',
        exp: accessExp,
        ver: sessionVersion,
    }, config.tokenSecret);
    const refreshToken = signToken({
        sub: user.id,
        role: user.role,
        typ: 'refresh',
        exp: refreshExp,
        ver: sessionVersion,
    }, config.tokenSecret);
    return {
        accessToken,
        refreshToken,
        accessTokenExpiresAt: new Date(accessExp * 1000).toISOString(),
        refreshTokenExpiresAt: new Date(refreshExp * 1000).toISOString(),
    };
}
function verifyRefreshToken(token, config, now = new Date()) {
    const claims = verifyToken(token, config.tokenSecret);
    if (claims.typ !== 'refresh') {
        throw new model_1.AuthenticationError('Invalid refresh token type.');
    }
    if (claims.exp <= toEpochSeconds(now)) {
        throw new model_1.AuthenticationError('Refresh token expired.');
    }
    return claims;
}
function verifyAccessToken(token, config, now = new Date()) {
    const claims = verifyToken(token, config.tokenSecret);
    if (claims.typ !== 'access') {
        throw new model_1.AuthenticationError('Invalid access token type.');
    }
    if (claims.exp <= toEpochSeconds(now)) {
        throw new model_1.AuthenticationError('Access token expired.');
    }
    return claims;
}
function signToken(claims, secret) {
    const header = {
        alg: 'HS256',
        typ: 'JWT',
    };
    const encodedHeader = encodeSegment(header);
    const encodedPayload = encodeSegment(claims);
    const signature = (0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');
    return `${encodedHeader}.${encodedPayload}.${signature}`;
}
function verifyToken(token, secret) {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
        throw new model_1.AuthenticationError('Malformed token.');
    }
    const expectedSignature = (0, node_crypto_1.createHmac)('sha256', secret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest();
    const actualSignature = Buffer.from(encodedSignature, 'base64url');
    if (expectedSignature.length !== actualSignature.length) {
        throw new model_1.AuthenticationError('Invalid token signature.');
    }
    if (!(0, node_crypto_1.timingSafeEqual)(expectedSignature, actualSignature)) {
        throw new model_1.AuthenticationError('Invalid token signature.');
    }
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
    return payload;
}
function encodeSegment(value) {
    return Buffer.from(JSON.stringify(value), 'utf-8').toString('base64url');
}
function toEpochSeconds(value) {
    return Math.floor(value.getTime() / 1000);
}
