"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpHealthServer = createHttpHealthServer;
const node_http_1 = require("node:http");
function createHttpHealthServer(options) {
    const server = (0, node_http_1.createServer)((request, response) => {
        const url = request.url ?? '/';
        if (url === '/health/live') {
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
            response.end(JSON.stringify({ serviceName: options.serviceName, status: 'live' }));
            return;
        }
        if (url === '/health/ready' || url === '/health') {
            const snapshot = options.getReadinessSnapshot();
            response.writeHead(snapshot.ready ? 200 : 503, {
                'content-type': 'application/json; charset=utf-8',
            });
            response.end(JSON.stringify(snapshot));
            return;
        }
        response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ serviceName: options.serviceName, status: 'not-found' }));
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
