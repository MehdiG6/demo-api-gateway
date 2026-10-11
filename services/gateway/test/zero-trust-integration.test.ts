import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pino from 'pino';

import { createUserApiApp } from '../../user-api/src/app.js';
import { createGatewayApp } from '../src/app.js';
import { createCognitoTokenVerifier } from '../src/infrastructure/auth/cognito-token-verifier.js';

async function listen(
  server: ReturnType<typeof createServer>,
): Promise<number> {
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return (server.address() as AddressInfo).port;
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

void test('enforces the complete zero-trust flow with a mocked OIDC provider', async (context) => {
  const logger = pino({ enabled: false });
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const keyId = 'integration-key';
  const issuer =
    'https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_integration';
  const clientId = 'integration-client';
  const publicJwk = await exportJWK(publicKey);

  const jwksServer = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({ keys: [{ ...publicJwk, kid: keyId, use: 'sig' }] }),
    );
  }).listen(0);
  const jwksPort = await listen(jwksServer);
  context.after(() => close(jwksServer));

  const backend = createUserApiApp(undefined, logger).listen(0);
  const backendPort = await listen(backend);
  context.after(() => close(backend));

  const verifyAccessToken = createCognitoTokenVerifier({
    issuer,
    clientId,
    jwksUri: `http://127.0.0.1:${jwksPort}/jwks.json`,
  });
  const gateway = createGatewayApp({
    backendUrl: `http://127.0.0.1:${backendPort}`,
    verifyAccessToken,
    logger,
  }).listen(0);
  const gatewayPort = await listen(gateway);
  context.after(() => close(gateway));

  const token = await new SignJWT({
    client_id: clientId,
    token_use: 'access',
    scope: 'demo-api/users.read demo-api/users.write',
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setSubject('verified-user')
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  const gatewayUrl = `http://127.0.0.1:${gatewayPort}/api/users`;
  const backendUrl = `http://127.0.0.1:${backendPort}/api/users`;

  const validResponse = await fetch(gatewayUrl, {
    headers: {
      authorization: `Bearer ${token}`,
      'x-verified-user': 'spoofed-admin',
    },
  });
  assert.equal(validResponse.status, 200);
  assert.deepEqual(await validResponse.json(), []);

  const missingTokenResponse = await fetch(gatewayUrl);
  assert.equal(missingTokenResponse.status, 401);
  assert.deepEqual(await missingTokenResponse.json(), {
    error: 'Unauthorized',
  });

  const bypassResponse = await fetch(backendUrl, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(bypassResponse.status, 403);
  assert.deepEqual(await bypassResponse.json(), { error: 'Forbidden' });
});
