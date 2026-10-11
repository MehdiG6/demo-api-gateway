import 'dotenv/config';

import { createUserApiApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './infrastructure/logging/create-logger.js';
import { registerProcessHandlers } from './infrastructure/runtime/register-process-handlers.js';

const { port, logLevel, trustProxyHops } = loadConfig();
const logger = createLogger(logLevel);

const server = createUserApiApp(undefined, logger, trustProxyHops).listen(
  port,
  () => {
    logger.info({ port }, 'User API listening');
  },
);
registerProcessHandlers(server, logger);
