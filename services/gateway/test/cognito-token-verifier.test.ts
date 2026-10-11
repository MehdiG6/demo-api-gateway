import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { createCognitoTokenVerifier } from '../src/infrastructure/auth/cognito-token-verifier.js';

void test('verifies claims and caches remote Cognito signing keys', async (context) => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  const keyId = 'test-key';
  let jwksRequests = 0;
  const jwksServer = createServer((_request, response) => {
    jwksRequests += 1;
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({ keys: [{ ...publicJwk, kid: keyId, use: 'sig' }] }),
    );
  }).listen(0);
  await new Promise<void>((resolve) => jwksServer.once('listening', resolve));
  context.after(
    () => new Promise<void>((resolve) => jwksServer.close(() => resolve())),
  );

  const { port } = jwksServer.address() as AddressInfo;
  const issuer =
    'https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_example';
  const audience = 'client-id';
  const verifier = createCognitoTokenVerifier({
    issuer,
    audience,
    jwksUri: `http://127.0.0.1:${port}/jwks.json`,
  });
  const token = await new SignJWT({ email: 'user@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setSubject('user-123')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  assert.equal((await verifier(token)).userId, 'user-123');
  assert.equal((await verifier(token)).userId, 'user-123');
  assert.equal(jwksRequests, 1);

  const expiredToken = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setSubject('user-123')
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(0)
    .sign(privateKey);
  await assert.rejects(verifier(expiredToken));
});
