import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from 'express';
import type { Logger } from 'pino';

import { UserService } from './application/user-service.ts';
import { InMemoryUserRepository } from './infrastructure/in-memory-user-repository.ts';
import { createLogger } from './infrastructure/logging/create-logger.ts';
import { requireVerifiedUser } from './interfaces/http/require-verified-user.ts';
import { createRequestLogger } from './interfaces/http/request-logger.ts';
import { createUserRouter } from './interfaces/http/user-router.ts';

interface UserApiDependencies {
  userService?: UserService;
  logger?: Logger;
  trustProxyHops?: number;
}

const handleUnknownRoute: RequestHandler = (_request, response) => {
  response.status(404).json({ error: 'Not Found' });
};

const handleUserApiError: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof SyntaxError) {
    request.log.warn({ err: error }, 'Invalid JSON body');
    response.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  request.log.error({ err: error }, 'Unhandled User API error');
  response.status(500).json({ error: 'Internal Server Error' });
};

export function createUserApiApp({
  userService = new UserService(new InMemoryUserRepository()),
  logger = createLogger('info'),
  trustProxyHops = 0,
}: UserApiDependencies = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.use(createRequestLogger(logger));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/users', requireVerifiedUser, createUserRouter(userService));

  app.use(handleUnknownRoute);
  app.use(handleUserApiError);

  return app;
}
