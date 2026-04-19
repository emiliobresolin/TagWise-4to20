import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { ReadinessSnapshot } from './readiness';

export interface HealthServerOptions {
  serviceName: string;
  host: string;
  port: number;
  getReadinessSnapshot: () => ReadinessSnapshot;
  handleRequest?: (
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
  ) => Promise<boolean> | boolean;
}

export interface HealthServerHandle {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
}

export function createHttpHealthServer(options: HealthServerOptions): HealthServerHandle {
  const server = createServer(async (request, response) => {
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

    if (options.handleRequest) {
      try {
        const handled = await options.handleRequest(request, response);
        if (handled) {
          return;
        }
      } catch (error) {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end(
          JSON.stringify({
            serviceName: options.serviceName,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown request handler error',
          }),
        );
        return;
      }
    }

    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ serviceName: options.serviceName, status: 'not-found' }));
  });

  return {
    async start(): Promise<{ port: number }> {
      await listenAsync(server, options.host, options.port);
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error(`Unable to determine bound port for ${options.serviceName}`);
      }

      return { port: address.port };
    },
    async stop(): Promise<void> {
      if (!server.listening) {
        return;
      }

      await closeAsync(server);
    },
  };
}

function listenAsync(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeAsync(server: Server): Promise<void> {
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
