"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpHealthServer = createHttpHealthServer;
const node_http_1 = require("node:http");
const correlation_1 = require("../diagnostics/correlation");
function createHttpHealthServer(options) {
    const server = (0, node_http_1.createServer)(async (request, response) => {
        const correlationId = (0, correlation_1.resolveCorrelationId)(request.headers[correlation_1.correlationIdHeaderName]);
        const logger = options.logger.child({
            correlationId,
            requestMethod: request.method ?? 'GET',
            requestPath: request.url ?? '/',
        });
        const url = request.url ?? '/';
        response.setHeader(correlation_1.correlationIdHeaderName, correlationId);
        if (url === '/health/live') {
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ serviceName: options.serviceName, status: 'live' }));
            options.metrics.recordRequest(200);
            logger.info('http.request.completed', { statusCode: 200 });
            return;
        }
        if (url === '/health/ready' || url === '/health') {
            const snapshot = options.getReadinessSnapshot();
            response.writeHead(snapshot.ready ? 200 : 503, {
                'content-type': 'application/json; charset=utf-8',
            });
            response.end(JSON.stringify(snapshot));
            options.metrics.recordRequest(snapshot.ready ? 200 : 503);
            logger.info('http.request.completed', { statusCode: snapshot.ready ? 200 : 503 });
            return;
        }
        if (url === '/metrics') {
            const metrics = options.getMetricsSnapshot();
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify(metrics));
            options.metrics.recordRequest(200);
            logger.info('http.request.completed', { statusCode: 200 });
            return;
        }
        if (options.handleRequest) {
            try {
                const handled = await options.handleRequest(request, response, {
                    correlationId,
                    logger,
                });
                if (handled) {
                    const statusCode = response.statusCode || 200;
                    options.metrics.recordRequest(statusCode);
                    logger.info('http.request.completed', { statusCode });
                    return;
                }
            }
            catch (error) {
                logger.error('http.request.failed', error);
                response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
                response.end(JSON.stringify({
                    serviceName: options.serviceName,
                    status: 'error',
                    message: error instanceof Error ? error.message : 'Unknown request handler error',
                }));
                options.metrics.recordRequest(500);
                return;
            }
        }
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ serviceName: options.serviceName, status: 'not-found' }));
        options.metrics.recordRequest(404);
        logger.warn('http.request.not_found', { statusCode: 404 });
    });
    return {
        async start() {
            await listenAsync(server, options.host, options.port);
            const address = server.address();
            if (!address || typeof address === 'string') {
                throw new Error(`Unable to determine bound port for ${options.serviceName}`);
            }
            return { port: address.port };
        },
        async stop() {
            if (!server.listening) {
                return;
            }
            await closeAsync(server);
        },
    };
}
function listenAsync(server, host, port) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.off('error', reject);
            resolve();
        });
    });
}
function closeAsync(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
