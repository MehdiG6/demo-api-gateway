import type { RequestHandler } from 'express';

export function createAuthorizeRequest({
  readScope = 'demo-api/users.read',
  writeScope = 'demo-api/users.write',
}: {
  readScope?: string;
  writeScope?: string;
} = {}): RequestHandler {
  return function authorizeRequest(request, response, next) {
    const requiredScope =
      request.method === 'GET' || request.method === 'HEAD'
        ? readScope
        : writeScope;
    const scopeClaim = request.authenticatedIdentity?.claims.scope;
    const grantedScopes =
      typeof scopeClaim === 'string'
        ? new Set(scopeClaim.split(/\s+/).filter(Boolean))
        : new Set<string>();

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
