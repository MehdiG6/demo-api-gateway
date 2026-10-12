import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';

import type { AccessTokenVerifier } from '../src/infrastructure/auth/cognito-token-verifier.js';
import { InsufficientScopeError } from '../src/infrastructure/auth/cognito-token-verifier.js';
import { createAuthenticateRequest } from '../src/interfaces/http/authenticate-request.js';

async function startTestApp(verifyAccessToken: AccessTokenVerifier) {
  let downstreamCalls = 0;
  const app = express();
  app.use(createAuthenticateRequest({ verifyAccessToken }));
  app.all('/api/users', (request, response) => {
    downstreamCalls += 1;
    response.json({ verifiedUser: request.get('x-verified-user') });
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    get downstreamCalls() {
      return downstreamCalls;
    },
    request: (headers: Record<string, string> = {}, method = 'GET') =>
      fetch(`http://127.0.0.1:${port}/api/users`, { headers, method }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

void test('returns 401 and does not invoke downstream handler for an invalid token', async (context) => {
  const testApp = await startTestApp(() =>
    Promise.reject(new Error('invalid token')),
  );
  context.after(() => testApp.close());

  const response = await testApp.request({ authorization: 'Bearer invalid' });

  assert.equal(response.status, 401);
  assert.equal(testApp.downstreamCalls, 0);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
});

void test('returns 401 without verification or forwarding when Bearer JWT is missing', async (context) => {
  let verifierCalls = 0;
  const testApp = await startTestApp(() => {
    verifierCalls += 1;
    return Promise.reject(new Error('should not be called'));
  });
  context.after(() => testApp.close());

  const missingResponse = await testApp.request();
  const wrongSchemeResponse = await testApp.request({
    authorization: 'Basic credentials',
  });

  assert.equal(missingResponse.status, 401);
  assert.equal(wrongSchemeResponse.status, 401);
  assert.equal(verifierCalls, 0);
  assert.equal(testApp.downstreamCalls, 0);
});

void test('injects the verified user before invoking the downstream handler', async (context) => {
  const requestedScopes: (readonly string[])[] = [];
  const testApp = await startTestApp((_token, requiredScopes = []) => {
    requestedScopes.push(requiredScopes);
    return Promise.resolve({
      userId: 'user-123',
      claims: {},
    });
  });
  context.after(() => testApp.close());

  const response = await testApp.request({ authorization: 'Bearer valid' });
  const writeResponse = await testApp.request(
    { authorization: 'Bearer valid' },
    'POST',
  );

  assert.equal(response.status, 200);
  assert.equal(writeResponse.status, 200);
  assert.equal(testApp.downstreamCalls, 2);
  assert.deepEqual(await response.json(), { verifiedUser: 'user-123' });
  assert.deepEqual(requestedScopes, [
    ['demo-api/users.read'],
    ['demo-api/users.write'],
  ]);
});

void test('returns 403 when the access token lacks the required scope', async (context) => {
  const testApp = await startTestApp(() =>
    Promise.reject(new InsufficientScopeError('scope missing')),
  );
  context.after(() => testApp.close());

  const response = await testApp.request({ authorization: 'Bearer valid' });

  assert.equal(response.status, 403);
  assert.equal(testApp.downstreamCalls, 0);
  assert.deepEqual(await response.json(), { error: 'Forbidden' });
});
