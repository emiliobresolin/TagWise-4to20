"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const node_crypto_1 = require("node:crypto");
const model_1 = require("./model");
const passwordCodec_1 = require("./passwordCodec");
const tokenCodec_1 = require("./tokenCodec");
class AuthService {
    repository;
    config;
    auditEvents;
    constructor(repository, config, auditEvents) {
        this.repository = repository;
        this.config = config;
        this.auditEvents = auditEvents;
    }
    async ensureSeedUsers() {
        const entries = Object.values(this.config.seedUsers);
        for (const entry of entries) {
            const passwordRecord = (0, passwordCodec_1.hashPassword)(entry.password);
            await this.repository.upsertSeedUser({
                id: buildSeedUserId(entry.role),
                email: entry.email,
                displayName: entry.displayName,
                role: entry.role,
                passwordHash: passwordRecord.hash,
                passwordSalt: passwordRecord.salt,
            });
        }
    }
    async loginConnected(request, context) {
        const user = await this.repository.findByEmail(request.email);
        if (!user) {
            throw new model_1.AuthenticationError('Invalid email or password.');
        }
        const validPassword = (0, passwordCodec_1.verifyPassword)(request.password, {
            salt: user.passwordSalt,
            hash: user.passwordHash,
        });
        if (!validPassword) {
            throw new model_1.AuthenticationError('Invalid email or password.');
        }
        const session = {
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                role: user.role,
            },
            tokens: (0, tokenCodec_1.issueTokenPair)(user, user.sessionVersion, this.config),
        };
        await this.auditEvents.recordEvent({
            actorId: user.id,
            actorRole: user.role,
            actionType: 'auth.login.connected',
            targetObjectType: 'user-session',
            targetObjectId: user.id,
            correlationId: context.correlationId,
            priorState: 'signed_out',
            nextState: 'connected',
            metadata: {
                email: user.email,
            },
        });
        return session;
    }
    async refreshConnected(refreshToken, context) {
        const claims = (0, tokenCodec_1.verifyRefreshToken)(refreshToken, this.config);
        const user = await this.repository.findById(claims.sub);
        if (!user || user.sessionVersion !== claims.ver) {
            throw new model_1.AuthenticationError('Session is no longer valid.');
        }
        const session = {
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                role: user.role,
            },
            tokens: (0, tokenCodec_1.issueTokenPair)(user, user.sessionVersion, this.config),
        };
        await this.auditEvents.recordEvent({
            actorId: user.id,
            actorRole: user.role,
            actionType: 'auth.refresh.connected',
            targetObjectType: 'user-session',
            targetObjectId: user.id,
            correlationId: context.correlationId,
            priorState: 'connected',
            nextState: 'connected',
            metadata: {
                email: user.email,
            },
        });
        return session;
    }
    async authenticateAccessToken(accessToken) {
        const claims = (0, tokenCodec_1.verifyAccessToken)(accessToken, this.config);
        const user = await this.repository.findById(claims.sub);
        if (!user || user.sessionVersion !== claims.ver) {
            throw new model_1.AuthenticationError('Session is no longer valid.');
        }
        return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
        };
    }
}
exports.AuthService = AuthService;
function buildSeedUserId(role) {
    return `seed-${role}-${(0, node_crypto_1.randomUUID)()}`.slice(0, 36);
}
