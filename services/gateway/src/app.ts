import express, { type ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';

import type { AccessTokenVerifier } from './infrastructure/auth/cognito-token-verifier.js';
import { createReverseProxy } from './infrastructure/http/create-reverse-proxy.js';
import { createLogger } from './infrastructure/logging/create-logger.js';
import { createAuthenticateRequest } from './interfaces/http/authenticate-request.js';
import { createAuthorizeRequest } from './interfaces/http/authorize-request.js';
import { createRequestLogger } from './interfaces/http/request-logger.js';

interface GatewayDependencies {
  backendUrl: string;
  verifyAccessToken: AccessTokenVerifier;
  readScope?: string;
  writeScope?: string;
  logger?: Logger;
  trustProxyHops?: number;
}

export function createGatewayApp({
  backendUrl,
  verifyAccessToken,
  readScope,
  writeScope,
  logger = createLogger('info'),
  trustProxyHops = 0,
}: GatewayDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.use(createRequestLogger(logger));

  app.use('/api/users', (request, _response, next) => {
    delete request.headers['x-verified-user'];
    next();
  });
  app.use(
    '/api/users',
    createAuthenticateRequest({ verifyAccessToken }),
  );
  app.use(
    '/api/users',
    createAuthorizeRequest({
      ...(readScope ? { readScope } : {}),
      ...(writeScope ? { writeScope } : {}),
    }),
  );
  app.use('/api/users', createReverseProxy(backendUrl));

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not Found' });
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    void _next;
    _request.log.error({ err: error }, 'Unhandled gateway error');
    response.status(500).json({ error: 'Internal Server Error' });
  };
  app.use(errorHandler);

  return app;
}
