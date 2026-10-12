#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { IdentityStack } from '../lib/identity-stack.ts';

function listContext(app: cdk.App, key: string, fallback: string[]): string[] {
  const value = app.node.tryGetContext(key) as string | undefined;
  return value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : fallback;
}

const app = new cdk.App();
const domainPrefix = app.node.tryGetContext('domainPrefix') as
  string | undefined;

if (!domainPrefix) {
  throw new Error(
    'Cognito domain prefix is required. Pass -c domainPrefix=<globally-unique-prefix>.',
  );
}

if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domainPrefix)) {
  throw new Error(
    'Cognito domain prefix must be 1-63 lowercase letters, numbers, or hyphens, and cannot start or end with a hyphen.',
  );
}

new IdentityStack(app, 'DemoApiIdentityStack', {
  env: {
    ...(process.env.CDK_DEFAULT_ACCOUNT
      ? { account: process.env.CDK_DEFAULT_ACCOUNT }
      : {}),
    region: 'ap-southeast-2',
  },
  domainPrefix,
  callbackUrls: listContext(app, 'callbackUrls', [
    'http://localhost:3000/callback',
  ]),
  logoutUrls: listContext(app, 'logoutUrls', ['http://localhost:3000']),
  description: 'Cognito OIDC resources for the TypeScript API gateway demo',
});
