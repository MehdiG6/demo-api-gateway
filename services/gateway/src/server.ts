import 'dotenv/config';

import { createGatewayApp } from './app.js';
import { loadConfig } from './config.js';
import { createCognitoTokenVerifier } from './infrastructure/auth/cognito-token-verifier.js';
import { createLogger } from './infrastructure/logging/create-logger.js';
import { registerProcessHandlers } from './infrastructure/runtime/register-process-handlers.js';

try {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const verifyAccessToken = createCognitoTokenVerifier({
    issuer: config.cognitoIssuer,
    clientId: config.cognitoClientId,
    ...(config.cognitoJwksUri ? { jwksUri: config.cognitoJwksUri } : {}),
  });
  const app = createGatewayApp({
    backendUrl: config.backendUrl,
    verifyAccessToken,
    readScope: config.cognitoReadScope,
    writeScope: config.cognitoWriteScope,
    logger,
    trustProxyHops: config.trustProxyHops,
  });

  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, backendUrl: config.backendUrl },
      'Gateway listening',
    );
  });
  registerProcessHandlers(server, logger);
} catch (error) {
  createLogger('info').fatal({ err: error }, 'Gateway failed to start');
  process.exitCode = 1;
}
