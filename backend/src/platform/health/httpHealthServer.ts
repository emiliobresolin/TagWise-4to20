import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { correlationIdHeaderName, resolveCorrelationId } from '../diagnostics/correlation';
import type { ServiceMetricsState } from '../diagnostics/serviceMetrics';
import type { StructuredLogger } from '../diagnostics/structuredLogger';
import type { ReadinessSnapshot } from './readiness';

export interface HttpRequestContext {
  correlationId: string;
  logger: StructuredLogger;
}

export interface HealthServerOptions {
  serviceName: string;
  host: string;
  port: number;
  getReadinessSnapshot: () => ReadinessSnapshot;
  getMetricsSnapshot: () => ReadinessSnapshot['metrics'];
  logger: StructuredLogger;
  metrics: ServiceMetricsState;
  handleRequest?: (
    request: IncomingMessage,
    response: ServerResponse<IncomingMessage>,
    context: HttpRequestContext,
  ) => Promise<boolean> | boolean;
}

export interface HealthServerHandle {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
}

export function createHttpHealthServer(options: HealthServerOptions): HealthServerHandle {
  const server = createServer(async (request, response) => {
    const correlationId = resolveCorrelationId(request.headers[correlationIdHeaderName]);
    const logger = options.logger.child({
      correlationId,
      requestMethod: request.method ?? 'GET',
      requestPath: request.url ?? '/',
    });
    const url = request.url ?? '/';
    response.setHeader(correlationIdHeaderName, correlationId);

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
      } catch (error) {
        logger.error('http.request.failed', error);
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end(
          JSON.stringify({
            serviceName: options.serviceName,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown request handler error',
          }),
        );
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
