import type { RequestHandler } from 'express';

import type { AccessTokenVerifier } from '../../infrastructure/auth/cognito-token-verifier.js';

declare module 'express-serve-static-core' {
  interface Request {
    verifiedUser?: string;
  }
}

export function createAuthenticateRequest({
  verifyAccessToken,
}: {
  verifyAccessToken: AccessTokenVerifier;
}): RequestHandler {
  return async function authenticateRequest(request, response, next) {
    const authorization = request.get('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);

    if (!match?.[1]) {
      request.log?.warn('Authentication failed: bearer token missing');
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const identity = await verifyAccessToken(match[1]);
      request.verifiedUser = identity.userId;
      request.headers['x-verified-user'] = identity.userId;
      next();
    } catch (error) {
      request.log?.warn(
        { err: error },
        'Authentication failed: token rejected',
      );
      response.status(401).json({ error: 'Unauthorized' });
    }
  };
}
