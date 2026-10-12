import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import pino, { type Logger } from 'pino';

import type { AccessTokenVerifier } from '../src/infrastructure/auth/cognito-token-verifier.js';
import { createAuthenticateRequest } from '../src/interfaces/http/authenticate-request.js';
import { createAuthorizeRequest } from '../src/interfaces/http/authorize-request.js';
import { createRequestLogger } from '../src/interfaces/http/request-logger.js';

async function startTestApp(
  verifyAccessToken: AccessTokenVerifier,
  logger: Logger = pino({ enabled: false }),
) {
  let downstreamCalls = 0;
  const app = express();
  app.use(createRequestLogger(logger));
  app.use(createAuthenticateRequest({ verifyAccessToken }));
  app.use(createAuthorizeRequest());
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

void test('does not expose rejected tokens or verifier details', async (context) => {
  const entries: Record<string, unknown>[] = [];
  const logger = pino(
    { base: null, timestamp: false },
    {
      write(message) {
        entries.push(JSON.parse(message) as Record<string, unknown>);
      },
    },
  );
  const testApp = await startTestApp(
    () => Promise.reject(new Error('sensitive verifier detail')),
    logger,
  );
  context.after(() => testApp.close());

  const response = await testApp.request({
    authorization: 'Bearer sensitive-token-value',
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  const serializedEntries = JSON.stringify(entries);
  assert.doesNotMatch(
    serializedEntries,
    /sensitive-token-value|sensitive verifier detail/,
  );
  const rejection = entries.find(
    (entry) => entry.msg === 'Authentication failed: token rejected',
  );
  assert.equal(rejection?.authenticationError, 'Error');
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
  const testApp = await startTestApp(() =>
    Promise.resolve({
      userId: 'user-123',
      claims: {
        scope: 'demo-api/users.read demo-api/users.write',
      },
    }),
  );
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
});

void test('returns 403 when the access token lacks the required scope', async (context) => {
  const testApp = await startTestApp(() =>
    Promise.resolve({
      userId: 'user-123',
      claims: { scope: 'demo-api/users.write' },
    }),
  );
  context.after(() => testApp.close());

  const response = await testApp.request({ authorization: 'Bearer valid' });

  assert.equal(response.status, 403);
  assert.equal(testApp.downstreamCalls, 0);
  assert.deepEqual(await response.json(), { error: 'Forbidden' });
});

void test('requires the write scope for mutations', async (context) => {
  const testApp = await startTestApp(() =>
    Promise.resolve({
      userId: 'user-123',
      claims: { scope: 'demo-api/users.read' },
    }),
  );
  context.after(() => testApp.close());

  const response = await testApp.request(
    { authorization: 'Bearer valid-token' },
    'POST',
  );

  assert.equal(response.status, 403);
  assert.equal(testApp.downstreamCalls, 0);
  assert.deepEqual(await response.json(), { error: 'Forbidden' });
});
