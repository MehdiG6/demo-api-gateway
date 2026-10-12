import type { RequestHandler } from 'express';

const READ_METHODS = new Set(['GET', 'HEAD']);

function getGrantedScopes(scopeClaim: unknown): Set<string> {
  if (typeof scopeClaim !== 'string') {
    return new Set();
  }

  return new Set(scopeClaim.split(/\s+/).filter(Boolean));
}

export function createAuthorizeRequest({
  readScope = 'demo-api/users.read',
  writeScope = 'demo-api/users.write',
}: {
  readScope?: string;
  writeScope?: string;
} = {}): RequestHandler {
  return function authorizeRequest(request, response, next) {
    const requiredScope = READ_METHODS.has(request.method)
      ? readScope
      : writeScope;
    const grantedScopes = getGrantedScopes(
      request.authenticatedIdentity?.claims.scope,
    );

    if (!grantedScopes.has(requiredScope)) {
      request.log?.warn(
        { userId: request.verifiedUser, requiredScope },
        'Authorization failed: scope missing',
      );
      response.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  };
}
