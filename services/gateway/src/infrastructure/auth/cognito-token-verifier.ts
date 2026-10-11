import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

interface CognitoVerifierOptions {
  issuer: string;
  audience: string;
  jwksUri?: string;
}

export interface VerifiedIdentity {
  userId: string;
  claims: JWTPayload;
}

export type AccessTokenVerifier = (token: string) => Promise<VerifiedIdentity>;

export function createCognitoTokenVerifier({
  issuer,
  audience,
  jwksUri,
}: CognitoVerifierOptions): AccessTokenVerifier {
  if (!issuer || !audience) {
    throw new Error('COGNITO_ISSUER and COGNITO_AUDIENCE are required');
  }

  const jwks = createRemoteJWKSet(
    new URL(jwksUri ?? `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`),
    { cooldownDuration: 30_000, cacheMaxAge: 600_000 },
  );

  return async function verifyAccessToken(token) {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      algorithms: ['RS256'],
    });

    const verifiedUser = payload.sub ?? payload.email;
    if (typeof verifiedUser !== 'string' || verifiedUser.length === 0) {
      throw new Error('Token does not contain a subject or email');
    }

    return { userId: verifiedUser, claims: payload };
  };
}
