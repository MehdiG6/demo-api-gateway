export interface GatewayConfig {
  port: number;
  backendUrl: string;
  cognitoIssuer: string;
  cognitoClientId: string;
  cognitoReadScope: string;
  cognitoWriteScope: string;
  cognitoJwksUri?: string;
  logLevel: string;
  trustProxyHops: number;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseTrustProxyHops(value: string | undefined): number {
  const hops = Number(value ?? '0');
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer');
  }
  return hops;
}

export function loadConfig(environment = process.env): GatewayConfig {
  const cognitoIssuer = environment.COGNITO_ISSUER;
  const cognitoClientId = environment.COGNITO_CLIENT_ID;

  if (!cognitoIssuer || !cognitoClientId) {
    throw new Error('COGNITO_ISSUER and COGNITO_CLIENT_ID are required');
  }

  return {
    port: parsePort(environment.GATEWAY_PORT),
    backendUrl: environment.BACKEND_URL ?? 'http://127.0.0.1:3001',
    cognitoIssuer,
    cognitoClientId,
    cognitoReadScope: environment.COGNITO_READ_SCOPE ?? 'demo-api/users.read',
    cognitoWriteScope:
      environment.COGNITO_WRITE_SCOPE ?? 'demo-api/users.write',
    logLevel: environment.LOG_LEVEL ?? 'info',
    trustProxyHops: parseTrustProxyHops(environment.TRUST_PROXY_HOPS),
    ...(environment.COGNITO_JWKS_URI
      ? { cognitoJwksUri: environment.COGNITO_JWKS_URI }
      : {}),
  };
}
