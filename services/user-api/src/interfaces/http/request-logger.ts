import { randomBytes, randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

declare module 'express-serve-static-core' {
  interface Request {
    log: Logger;
    requestId: string;
    traceparent: string;
  }
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const traceparentPattern = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const emptyTraceId = '0'.repeat(32);
const emptySpanId = '0'.repeat(16);

function createTraceparent(): string {
  return `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
}

function isValidTraceparent(value: string): boolean {
  const [, traceId, spanId] = value.split('-');
  return (
    traceparentPattern.test(value) &&
    traceId !== emptyTraceId &&
    spanId !== emptySpanId
  );
}

export function createRequestLogger(logger: Logger): RequestHandler {
  return function requestLogger(request, response, next) {
    const startedAt = performance.now();
    const suppliedRequestId = request.get('x-request-id');
    const suppliedTraceparent = request.get('traceparent')?.toLowerCase();
    const requestId =
      suppliedRequestId && requestIdPattern.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    const traceparent =
      suppliedTraceparent && isValidTraceparent(suppliedTraceparent)
        ? suppliedTraceparent
        : createTraceparent();

    request.requestId = requestId;
    request.traceparent = traceparent;
    request.log = logger.child({
      requestId,
      traceId: traceparent.split('-')[1],
      spanId: traceparent.split('-')[2],
    });
    response.setHeader('x-request-id', requestId);
    response.setHeader('traceparent', traceparent);

    let finished = false;
    response.on('finish', () => {
      finished = true;
      const details = {
        method: request.method,
        path: request.path,
        sourceIp: request.ip,
        userId: request.get('x-verified-user'),
        statusCode: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      };

      if (response.statusCode >= 500) {
        request.log.error(details, 'Request completed');
      } else if (response.statusCode >= 400) {
        request.log.warn(details, 'Request completed');
      } else {
        request.log.info(details, 'Request completed');
      }
    });
    response.on('close', () => {
      if (!finished) {
        request.log.warn(
          {
            method: request.method,
            path: request.path,
            durationMs: Math.round(performance.now() - startedAt),
          },
          'Request aborted',
        );
      }
    });

    next();
  };
}
