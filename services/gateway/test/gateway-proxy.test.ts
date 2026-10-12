import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import pino from 'pino';

import { createGatewayApp } from '../src/app.ts';

void test('forwards the verified identity and preserves the user API path', async (context) => {
  let receivedPath = '';
  let receivedUser = '';
  let receivedRequestId = '';
  let receivedTraceparent = '';
  let receivedAuthorization = '';
  let receivedCookie = '';
  const backend = createServer((request, response) => {
    receivedPath = request.url ?? '';
    receivedUser = String(request.headers['x-verified-user'] ?? '');
    receivedRequestId = String(request.headers['x-request-id'] ?? '');
    receivedTraceparent = String(request.headers.traceparent ?? '');
    receivedAuthorization = String(request.headers.authorization ?? '');
    receivedCookie = String(request.headers.cookie ?? '');
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ok: true }));
  }).listen(0);
  await new Promise<void>((resolve) => backend.once('listening', resolve));
  context.after(
    () => new Promise<void>((resolve) => backend.close(() => resolve())),
  );
  const backendPort = (backend.address() as AddressInfo).port;

  const app = createGatewayApp({
    backendUrl: `http://127.0.0.1:${backendPort}`,
    verifyAccessToken: () =>
      Promise.resolve({
        userId: 'trusted-user',
        claims: { scope: 'demo-api/users.read' },
      }),
    logger: pino({ enabled: false }),
  });
  const gateway = app.listen(0);
  await new Promise<void>((resolve) => gateway.once('listening', resolve));
  context.after(
    () => new Promise<void>((resolve) => gateway.close(() => resolve())),
  );
  const gatewayPort = (gateway.address() as AddressInfo).port;

  const response = await fetch(
    `http://127.0.0.1:${gatewayPort}/api/users/42?active=true`,
    {
      headers: {
        authorization: 'Bearer valid',
        cookie: 'session=sensitive-value',
        'x-request-id': 'request-123',
        'x-verified-user': 'spoofed-user',
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(receivedPath, '/api/users/42?active=true');
  assert.equal(receivedUser, 'trusted-user');
  assert.equal(receivedRequestId, 'request-123');
  assert.equal(receivedAuthorization, '');
  assert.equal(receivedCookie, '');
  assert.match(receivedTraceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  assert.equal(response.headers.get('x-request-id'), 'request-123');
});
