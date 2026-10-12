import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

interface CognitoVerifierOptions {
  issuer: string;
  clientId: string;
  jwksUri?: string;
}

export interface VerifiedIdentity {
  userId: string;
  claims: JWTPayload;
}

export type AccessTokenVerifier = (token: string) => Promise<VerifiedIdentity>;

export function createCognitoTokenVerifier({
  issuer,
  clientId,
  jwksUri,
}: CognitoVerifierOptions): AccessTokenVerifier {
  if (!issuer || !clientId) {
    throw new Error('COGNITO_ISSUER and COGNITO_CLIENT_ID are required');
  }

  const jwks = createRemoteJWKSet(
    new URL(jwksUri ?? `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`),
    { cooldownDuration: 30_000, cacheMaxAge: 600_000 },
  );

  return async function verifyAccessToken(token) {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'sub'],
    });

    if (payload.token_use !== 'access') {
      throw new Error('Token is not a Cognito access token');
    }
    if (payload.client_id !== clientId) {
      throw new Error('Token was issued to a different client');
    }
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Token does not contain a subject');
    }

    return { userId: payload.sub, claims: payload };
  };
}
