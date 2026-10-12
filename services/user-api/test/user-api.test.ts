import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import pino from 'pino';

import type { UserRepository } from '../src/application/user-repository.js';
import { UserService } from '../src/application/user-service.js';
import { createUserApiApp } from '../src/app.js';

async function startUserApi(userService?: UserService) {
  const server = createUserApiApp(userService, pino({ enabled: false })).listen(
    0,
  );
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/users`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const verifiedHeaders = {
  'content-type': 'application/json',
  'x-verified-user': 'caller-123',
};

void test('rejects requests that do not come through the gateway', async (context) => {
  const api = await startUserApi();
  context.after(() => api.close());

  const response = await fetch(api.url);

  assert.equal(response.status, 403);
  assert.ok(response.headers.get('x-request-id'));
  assert.match(
    response.headers.get('traceparent') ?? '',
    /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/,
  );
  assert.deepEqual(await response.json(), { error: 'Forbidden' });
});

void test('supports the complete user CRUD lifecycle', async (context) => {
  const api = await startUserApi();
  context.after(() => api.close());

  const createdResponse = await fetch(api.url, {
    method: 'POST',
    headers: verifiedHeaders,
    body: JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.com' }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as { id: string };

  const getResponse = await fetch(`${api.url}/${created.id}`, {
    headers: verifiedHeaders,
  });
  assert.equal(getResponse.status, 200);

  const updateResponse = await fetch(`${api.url}/${created.id}`, {
    method: 'PUT',
    headers: verifiedHeaders,
    body: JSON.stringify({ name: 'Ada Byron', email: 'ada@example.com' }),
  });
  assert.equal(updateResponse.status, 200);
  assert.equal(
    ((await updateResponse.json()) as { name: string }).name,
    'Ada Byron',
  );

  const listResponse = await fetch(api.url, { headers: verifiedHeaders });
  assert.equal(listResponse.status, 200);
  assert.equal(((await listResponse.json()) as unknown[]).length, 1);

  const deleteResponse = await fetch(`${api.url}/${created.id}`, {
    method: 'DELETE',
    headers: verifiedHeaders,
  });
  assert.equal(deleteResponse.status, 204);

  const missingResponse = await fetch(`${api.url}/${created.id}`, {
    headers: verifiedHeaders,
  });
  assert.equal(missingResponse.status, 404);
});

void test('returns 400 for invalid input without exposing details', async (context) => {
  const api = await startUserApi();
  context.after(() => api.close());

  const invalidResponse = await fetch(api.url, {
    method: 'POST',
    headers: verifiedHeaders,
    body: JSON.stringify({ name: '', email: 'not-an-email' }),
  });
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(await invalidResponse.json(), {
    error: 'Invalid request body',
  });

  const malformedResponse = await fetch(api.url, {
    method: 'POST',
    headers: verifiedHeaders,
    body: '{',
  });
  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await malformedResponse.json(), {
    error: 'Invalid JSON body',
  });
});

void test('returns a generic 500 without leaking internal errors', async (context) => {
  const repository: UserRepository = {
    findAll: () => Promise.reject(new Error('sensitive implementation detail')),
    findById: () => Promise.resolve(undefined),
    create: () => Promise.reject(new Error('not used')),
    update: () => Promise.resolve(undefined),
    delete: () => Promise.resolve(false),
  };
  const api = await startUserApi(new UserService(repository));
  context.after(() => api.close());

  const response = await fetch(api.url, { headers: verifiedHeaders });
  const body = await response.text();

  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(body), { error: 'Internal Server Error' });
  assert.doesNotMatch(body, /sensitive implementation detail|stack/i);
});
