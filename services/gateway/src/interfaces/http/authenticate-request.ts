import type { RequestHandler } from 'express';

import {
  type AccessTokenVerifier,
  type VerifiedIdentity,
} from '../../infrastructure/auth/cognito-token-verifier.ts';

declare module 'express-serve-static-core' {
  interface Request {
    authenticatedIdentity?: VerifiedIdentity;
    verifiedUser?: string;
  }
}

interface AuthenticationFailure {
  authenticationError: string;
  authenticationErrorCode?: string;
}

function getBearerToken(authorizationHeader: string | undefined) {
  return authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
}

function describeAuthenticationFailure(error: unknown): AuthenticationFailure {
  const authenticationError =
    error instanceof Error ? error.name : 'UnknownError';

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return { authenticationError, authenticationErrorCode: error.code };
  }

  return { authenticationError };
}

export function createAuthenticateRequest({
  verifyAccessToken,
}: {
  verifyAccessToken: AccessTokenVerifier;
}): RequestHandler {
  return async function authenticateRequest(request, response, next) {
    const token = getBearerToken(request.get('authorization'));

    if (!token) {
      request.log?.warn('Authentication failed: bearer token missing');
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const identity = await verifyAccessToken(token);
      request.authenticatedIdentity = identity;
      request.verifiedUser = identity.userId;
      request.headers['x-verified-user'] = identity.userId;
      next();
    } catch (error) {
      request.log?.warn(
        describeAuthenticationFailure(error),
        'Authentication failed: token rejected',
      );
      response.status(401).json({ error: 'Unauthorized' });
    }
  };
}
