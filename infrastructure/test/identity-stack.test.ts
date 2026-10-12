import assert from 'node:assert/strict';
import test from 'node:test';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { IdentityStack } from '../lib/identity-stack.ts';

function createTemplate(): Template {
  const app = new cdk.App();
  const stack = new IdentityStack(app, 'TestIdentityStack', {
    env: { account: '123456789012', region: 'ap-southeast-2' },
    domainPrefix: 'demo-api-gateway-test',
    callbackUrls: ['http://localhost:3000/callback'],
    logoutUrls: ['http://localhost:3000'],
  });
  return Template.fromStack(stack);
}

void test('creates a retained email-based Cognito user pool', () => {
  const template = createTemplate();

  template.hasResource('AWS::Cognito::UserPool', {
    DeletionPolicy: 'Retain',
    Properties: Match.objectLike({
      AutoVerifiedAttributes: ['email'],
      UsernameAttributes: ['email'],
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
      },
    }),
  });
});

void test('creates API scopes and a public authorization-code client', () => {
  const template = createTemplate();

  template.hasResourceProperties('AWS::Cognito::UserPoolResourceServer', {
    Identifier: 'demo-api',
    Scopes: Match.arrayWith([
      { ScopeName: 'users.read', ScopeDescription: 'Read users' },
      {
        ScopeName: 'users.write',
        ScopeDescription: 'Create, update, and delete users',
      },
    ]),
  });
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    AllowedOAuthFlows: ['code'],
    AllowedOAuthFlowsUserPoolClient: true,
    AllowedOAuthScopes: Match.arrayWith([
      'openid',
      'email',
      'profile',
      Match.objectLike({
        'Fn::Join': ['', Match.arrayWith(['/users.read'])],
      }),
      Match.objectLike({
        'Fn::Join': ['', Match.arrayWith(['/users.write'])],
      }),
    ]),
    CallbackURLs: ['http://localhost:3000/callback'],
    GenerateSecret: false,
    PreventUserExistenceErrors: 'ENABLED',
  });
});

void test('creates the hosted UI domain and environment outputs', () => {
  const template = createTemplate();

  template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
    Domain: 'demo-api-gateway-test',
  });
  const outputs = template.findOutputs('*');
  assert.ok(outputs.CognitoIssuer);
  assert.ok(outputs.CognitoClientId);
  assert.ok(outputs.HostedUiBaseUrl);
});
