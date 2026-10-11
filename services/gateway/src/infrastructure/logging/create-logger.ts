import pino from 'pino';

export function createLogger(level: string) {
  return pino({
    level,
    base: {
      service: 'gateway',
      environment: process.env.NODE_ENV ?? 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'authorization',
        'token',
        'accessToken',
        'idToken',
        'err.body',
        'req.headers.authorization',
      ],
      censor: '[REDACTED]',
    },
    serializers: { err: pino.stdSerializers.err },
  });
}
