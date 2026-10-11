import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

export interface IdentityStackProps extends cdk.StackProps {
  domainPrefix: string;
  callbackUrls: string[];
  logoutUrls: string[];
}

export class IdentityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'demo-api-gateway-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const client = userPool.addClient('OidcClient', {
      userPoolClientName: 'demo-api-gateway-local-client',
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    const domain = userPool.addDomain('HostedUiDomain', {
      cognitoDomain: { domainPrefix: props.domainPrefix },
    });

    cdk.Tags.of(this).add('Application', 'demo-api-gateway');
    cdk.Tags.of(this).add('ManagedBy', 'AWS CDK');

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    new cdk.CfnOutput(this, 'CognitoIssuer', {
      value: `https://cognito-idp.${cdk.Aws.REGION}.${cdk.Aws.URL_SUFFIX}/${userPool.userPoolId}`,
    });
    new cdk.CfnOutput(this, 'CognitoAudience', {
      value: client.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'HostedUiBaseUrl', {
      value: domain.baseUrl(),
    });
  }
}
