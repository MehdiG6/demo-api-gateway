import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import type { Logger } from 'pino';

import type { AccessTokenVerifier } from './infrastructure/auth/cognito-token-verifier.ts';
import { createReverseProxy } from './infrastructure/http/create-reverse-proxy.ts';
import { createLogger } from './infrastructure/logging/create-logger.ts';
import { createAuthenticateRequest } from './interfaces/http/authenticate-request.ts';
import { createAuthorizeRequest } from './interfaces/http/authorize-request.ts';
import { createRequestLogger } from './interfaces/http/request-logger.ts';

interface GatewayDependencies {
  backendUrl: string;
  verifyAccessToken: AccessTokenVerifier;
  readScope?: string;
  writeScope?: string;
  logger?: Logger;
  trustProxyHops?: number;
}

const removeUntrustedUserHeader: RequestHandler = (
  request,
  _response,
  next,
) => {
  delete request.headers['x-verified-user'];
  next();
};

const handleUnknownRoute: RequestHandler = (_request, response) => {
  response.status(404).json({ error: 'Not Found' });
};

const handleGatewayError: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  request.log.error({ err: error }, 'Unhandled gateway error');
  response.status(500).json({ error: 'Internal Server Error' });
};

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

  app.use('/api/users', removeUntrustedUserHeader);
  app.use('/api/users', createAuthenticateRequest({ verifyAccessToken }));
  app.use(
    '/api/users',
    createAuthorizeRequest({
      ...(readScope ? { readScope } : {}),
      ...(writeScope ? { writeScope } : {}),
    }),
  );
  app.use('/api/users', createReverseProxy(backendUrl));

  app.use(handleUnknownRoute);
  app.use(handleGatewayError);

  return app;
}
