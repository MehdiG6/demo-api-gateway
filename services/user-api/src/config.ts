export interface UserApiConfig {
  port: number;
  logLevel: string;
  trustProxyHops: number;
}

export function loadConfig(environment = process.env): UserApiConfig {
  const port = Number(environment.USER_API_PORT ?? '3001');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('USER_API_PORT must be an integer between 1 and 65535');
  }

  const trustProxyHops = Number(environment.TRUST_PROXY_HOPS ?? '0');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer');
  }

  return {
    port,
    logLevel: environment.LOG_LEVEL ?? 'info',
    trustProxyHops,
  };
}
