import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { createCognitoTokenVerifier } from '../src/infrastructure/auth/cognito-token-verifier.js';

void test('verifies claims and caches remote Cognito signing keys', async (context) => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const { privateKey: untrustedPrivateKey } = await generateKeyPair('RS256');
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
  const clientId = 'client-id';
  const verifier = createCognitoTokenVerifier({
    issuer,
    clientId,
    jwksUri: `http://127.0.0.1:${port}/jwks.json`,
  });
  const token = await new SignJWT({
    client_id: clientId,
    token_use: 'access',
    scope: 'demo-api/users.read demo-api/users.write',
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setSubject('user-123')
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  assert.equal(
    (await verifier(token, ['demo-api/users.read'])).userId,
    'user-123',
  );
  assert.equal(
    (await verifier(token, ['demo-api/users.write'])).userId,
    'user-123',
  );
  assert.equal(jwksRequests, 1);

  const createToken = (
    claims: Record<string, unknown>,
    options: { expiration?: number | string; tokenIssuer?: string } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: keyId })
      .setSubject('user-123')
      .setIssuer(options.tokenIssuer ?? issuer)
      .setExpirationTime(options.expiration ?? '5m')
      .sign(privateKey);

  const expiredToken = await createToken(
    { client_id: clientId, token_use: 'access', scope: 'demo-api/users.read' },
    { expiration: 0 },
  );
  await assert.rejects(verifier(expiredToken, ['demo-api/users.read']));

  const wrongIssuerToken = await createToken(
    { client_id: clientId, token_use: 'access', scope: 'demo-api/users.read' },
    { tokenIssuer: 'https://issuer.example.test' },
  );
  await assert.rejects(verifier(wrongIssuerToken, ['demo-api/users.read']));

  const idToken = await createToken({
    aud: clientId,
    token_use: 'id',
    scope: 'demo-api/users.read',
  });
  await assert.rejects(verifier(idToken, ['demo-api/users.read']));

  const wrongClientToken = await createToken({
    client_id: 'other-client',
    token_use: 'access',
    scope: 'demo-api/users.read',
  });
  await assert.rejects(verifier(wrongClientToken, ['demo-api/users.read']));

  await assert.rejects(verifier(token, ['demo-api/admin']));

  const invalidSignatureToken = await new SignJWT({
    client_id: clientId,
    token_use: 'access',
    scope: 'demo-api/users.read',
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setSubject('user-123')
    .setIssuer(issuer)
    .setExpirationTime('5m')
    .sign(untrustedPrivateKey);
  await assert.rejects(
    verifier(invalidSignatureToken, ['demo-api/users.read']),
  );
});
