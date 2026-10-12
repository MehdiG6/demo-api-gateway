import type { Server } from 'node:http';
import type { Logger } from 'pino';

export function registerProcessHandlers(server: Server, logger: Logger): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, 'Graceful shutdown started');

    const timeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out');
      process.exitCode = 1;
      server.closeAllConnections();
    }, 10_000);
    timeout.unref();

    server.close((error) => {
      clearTimeout(timeout);
      if (error) {
        logger.error({ err: error }, 'HTTP server shutdown failed');
        process.exitCode = 1;
        return;
      }
      logger.info('Graceful shutdown completed');
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.on('error', (error) => {
    logger.fatal({ err: error }, 'HTTP server error');
    process.exitCode = 1;
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}
