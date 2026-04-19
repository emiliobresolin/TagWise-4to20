"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiRequestHandler = createApiRequestHandler;
const model_1 = require("../modules/auth/model");
function createApiRequestHandler(dependencies) {
    return async function handleRequest(request, response, context) {
        const method = request.method ?? 'GET';
        const url = request.url ?? '/';
        if (method === 'POST' && url === '/auth/login') {
            const body = await readJsonBody(request);
            if (!body.email || !body.password) {
                writeJson(response, 400, { message: 'email and password are required.' });
                return true;
            }
            try {
                const session = await dependencies.authService.loginConnected({
                    email: body.email,
                    password: body.password,
                }, {
                    correlationId: context.correlationId,
                });
                context.logger.info('auth.login.succeeded', {
                    actorId: session.user.id,
                    actorRole: session.user.role,
                });
                writeJson(response, 200, session);
            }
            catch (error) {
                context.logger.warn('auth.login.failed', {
                    statusCode: error instanceof model_1.AuthenticationError ? error.statusCode : 500,
                });
                writeAuthError(response, error);
            }
            return true;
        }
        if (method === 'POST' && url === '/auth/refresh') {
            const body = await readJsonBody(request);
            if (!body.refreshToken) {
                writeJson(response, 400, { message: 'refreshToken is required.' });
                return true;
            }
            try {
                const session = await dependencies.authService.refreshConnected(body.refreshToken, {
                    correlationId: context.correlationId,
                });
                context.logger.info('auth.refresh.succeeded', {
                    actorId: session.user.id,
                    actorRole: session.user.role,
                });
                writeJson(response, 200, session);
            }
            catch (error) {
                context.logger.warn('auth.refresh.failed', {
                    statusCode: error instanceof model_1.AuthenticationError ? error.statusCode : 500,
                });
                writeAuthError(response, error);
            }
            return true;
        }
        return false;
    };
}
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    return (raw ? JSON.parse(raw) : {});
}
function writeAuthError(response, error) {
    if (error instanceof model_1.AuthenticationError) {
        writeJson(response, error.statusCode, { message: error.message });
        return;
    }
    writeJson(response, 500, { message: 'Unexpected authentication error.' });
}
function writeJson(response, statusCode, payload) {
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
}
