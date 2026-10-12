import type { RequestHandler } from 'express';

import {
  type AccessTokenVerifier,
  type VerifiedIdentity,
} from '../../infrastructure/auth/cognito-token-verifier.js';

declare module 'express-serve-static-core' {
  interface Request {
    authenticatedIdentity?: VerifiedIdentity;
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
      request.authenticatedIdentity = identity;
      request.verifiedUser = identity.userId;
      request.headers['x-verified-user'] = identity.userId;
      next();
    } catch (error) {
      const authenticationError =
        error instanceof Error ? error.name : 'UnknownError';
      const authenticationErrorCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : undefined;
      request.log?.warn(
        {
          authenticationError,
          ...(authenticationErrorCode
            ? { authenticationErrorCode }
            : {}),
        },
        'Authentication failed: token rejected',
      );
      response.status(401).json({ error: 'Unauthorized' });
    }
  };
}
