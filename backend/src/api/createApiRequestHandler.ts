import type { IncomingMessage, ServerResponse } from 'node:http';

import { AuthenticationError } from '../modules/auth/model';
import type { AuthService } from '../modules/auth/authService';

export interface ApiRequestHandlerDependencies {
  authService: AuthService;
}

export function createApiRequestHandler(dependencies: ApiRequestHandlerDependencies) {
  return async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    const method = request.method ?? 'GET';
    const url = request.url ?? '/';

    if (method === 'POST' && url === '/auth/login') {
      const body = await readJsonBody<{ email?: string; password?: string }>(request);
      if (!body.email || !body.password) {
        writeJson(response, 400, { message: 'email and password are required.' });
        return true;
      }

      try {
        const session = await dependencies.authService.loginConnected({
          email: body.email,
          password: body.password,
        });
        writeJson(response, 200, session);
      } catch (error) {
        writeAuthError(response, error);
      }

      return true;
    }

    if (method === 'POST' && url === '/auth/refresh') {
      const body = await readJsonBody<{ refreshToken?: string }>(request);
      if (!body.refreshToken) {
        writeJson(response, 400, { message: 'refreshToken is required.' });
        return true;
      }

      try {
        const session = await dependencies.authService.refreshConnected(body.refreshToken);
        writeJson(response, 200, session);
      } catch (error) {
        writeAuthError(response, error);
      }

      return true;
    }

    return false;
  };
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  return (raw ? JSON.parse(raw) : {}) as T;
}

function writeAuthError(response: ServerResponse, error: unknown) {
  if (error instanceof AuthenticationError) {
    writeJson(response, error.statusCode, { message: error.message });
    return;
  }

  writeJson(response, 500, { message: 'Unexpected authentication error.' });
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}
