import { config as loadDotEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadDotEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

import { createUserApiApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './infrastructure/logging/create-logger.js';
import { registerProcessHandlers } from './infrastructure/runtime/register-process-handlers.js';

try {
  const { port, logLevel, trustProxyHops } = loadConfig();
  const logger = createLogger(logLevel);

  const server = createUserApiApp(undefined, logger, trustProxyHops).listen(
    port,
    () => {
      logger.info({ port }, 'User API listening');
    },
  );
  registerProcessHandlers(server, logger);
} catch (error) {
  createLogger('info').fatal({ err: error }, 'User API failed to start');
  process.exitCode = 1;
}
