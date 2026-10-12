import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import pino from 'pino';

import { createRequestLogger } from '../src/interfaces/http/request-logger.ts';

void test('writes structured gateway request details with the verified user', async (context) => {
  const entries: Record<string, unknown>[] = [];
  const logger = pino(
    { base: null, timestamp: false },
    {
      write(message) {
        entries.push(JSON.parse(message) as Record<string, unknown>);
      },
    },
  );
  const app = express();
  app.use(createRequestLogger(logger));
  app.get('/api/users', (request, response) => {
    request.verifiedUser = 'user-123';
    response.json([]);
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  context.after(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const { port } = server.address() as AddressInfo;

  const response = await fetch(
    `http://127.0.0.1:${port}/api/users?token=sensitive-query-value`,
  );
  assert.equal(response.status, 200);
  await response.text();

  const completion = entries.find((entry) => entry.msg === 'Request completed');
  assert.ok(completion);
  assert.equal(completion.method, 'GET');
  assert.equal(completion.path, '/api/users');
  assert.equal(completion.userId, 'user-123');
  assert.equal(typeof completion.sourceIp, 'string');
  assert.equal(typeof completion.timestamp, 'string');
  assert.equal(Number.isNaN(Date.parse(String(completion.timestamp))), false);
  assert.doesNotMatch(JSON.stringify(entries), /sensitive-query-value/);
});
