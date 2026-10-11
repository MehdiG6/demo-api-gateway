import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';

import type { AccessTokenVerifier } from '../src/infrastructure/auth/cognito-token-verifier.js';
import { createAuthenticateRequest } from '../src/interfaces/http/authenticate-request.js';

async function startTestApp(verifyAccessToken: AccessTokenVerifier) {
  let downstreamCalls = 0;
  const app = express();
  app.use(createAuthenticateRequest({ verifyAccessToken }));
  app.get('/api/users', (request, response) => {
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
    request: (headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}/api/users`, { headers }),
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

void test('injects the verified user before invoking the downstream handler', async (context) => {
  const testApp = await startTestApp(() =>
    Promise.resolve({
      userId: 'user-123',
      claims: {},
    }),
  );
  context.after(() => testApp.close());

  const response = await testApp.request({ authorization: 'Bearer valid' });

  assert.equal(response.status, 200);
  assert.equal(testApp.downstreamCalls, 1);
  assert.deepEqual(await response.json(), { verifiedUser: 'user-123' });
});
