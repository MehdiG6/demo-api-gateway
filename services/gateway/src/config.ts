export interface GatewayConfig {
  port: number;
  backendUrl: string;
  cognitoIssuer: string;
  cognitoAudience: string;
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
  const cognitoAudience = environment.COGNITO_AUDIENCE;

  if (!cognitoIssuer || !cognitoAudience) {
    throw new Error('COGNITO_ISSUER and COGNITO_AUDIENCE are required');
  }

  return {
    port: parsePort(environment.GATEWAY_PORT),
    backendUrl: environment.BACKEND_URL ?? 'http://127.0.0.1:3001',
    cognitoIssuer,
    cognitoAudience,
    logLevel: environment.LOG_LEVEL ?? 'info',
    trustProxyHops: parseTrustProxyHops(environment.TRUST_PROXY_HOPS),
    ...(environment.COGNITO_JWKS_URI
      ? { cognitoJwksUri: environment.COGNITO_JWKS_URI }
      : {}),
  };
}
