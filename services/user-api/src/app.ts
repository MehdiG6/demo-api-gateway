import express, { type ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';

import { UserService } from './application/user-service.js';
import { InMemoryUserRepository } from './infrastructure/in-memory-user-repository.js';
import { createLogger } from './infrastructure/logging/create-logger.js';
import { requireVerifiedUser } from './interfaces/http/require-verified-user.js';
import { createRequestLogger } from './interfaces/http/request-logger.js';
import { createUserRouter } from './interfaces/http/user-router.js';

export function createUserApiApp(
  userService = new UserService(new InMemoryUserRepository()),
  logger: Logger = createLogger('info'),
  trustProxyHops = 0,
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.use(createRequestLogger(logger));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/users', requireVerifiedUser, createUserRouter(userService));

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not Found' });
  });

  const errorHandler: ErrorRequestHandler = (
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
  app.use(errorHandler);

  return app;
}
