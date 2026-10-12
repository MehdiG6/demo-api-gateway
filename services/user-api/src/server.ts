import { config as loadDotEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadDotEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

import { createUserApiApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createLogger } from './infrastructure/logging/create-logger.ts';
import { registerProcessHandlers } from './infrastructure/runtime/register-process-handlers.ts';

try {
  const { port, logLevel, trustProxyHops } = loadConfig();
  const logger = createLogger(logLevel);

  const app = createUserApiApp({ logger, trustProxyHops });
  const server = app.listen(port, () => {
    logger.info({ port }, 'User API listening');
  });
  registerProcessHandlers(server, logger);
} catch (error) {
  createLogger('info').fatal({ err: error }, 'User API failed to start');
  process.exitCode = 1;
}
