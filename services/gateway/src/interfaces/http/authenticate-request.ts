import type { RequestHandler } from 'express';

import {
  InsufficientScopeError,
  type AccessTokenVerifier,
} from '../../infrastructure/auth/cognito-token-verifier.js';

declare module 'express-serve-static-core' {
  interface Request {
    verifiedUser?: string;
  }
}

export function createAuthenticateRequest({
  verifyAccessToken,
  readScope = 'demo-api/users.read',
  writeScope = 'demo-api/users.write',
}: {
  verifyAccessToken: AccessTokenVerifier;
  readScope?: string;
  writeScope?: string;
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
      const requiredScope =
        request.method === 'GET' || request.method === 'HEAD'
          ? readScope
          : writeScope;
      const identity = await verifyAccessToken(match[1], [requiredScope]);
      request.verifiedUser = identity.userId;
      request.headers['x-verified-user'] = identity.userId;
      next();
    } catch (error) {
      if (error instanceof InsufficientScopeError) {
        request.log?.warn(
          { err: error },
          'Authorization failed: scope missing',
        );
        response.status(403).json({ error: 'Forbidden' });
        return;
      }
      request.log?.warn(
        { err: error },
        'Authentication failed: token rejected',
      );
      response.status(401).json({ error: 'Unauthorized' });
    }
  };
}
