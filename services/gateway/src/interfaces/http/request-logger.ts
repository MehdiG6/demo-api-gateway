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

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const TRACEPARENT_PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const EMPTY_TRACE_ID = '0'.repeat(32);
const EMPTY_SPAN_ID = '0'.repeat(16);

function createTraceparent(): string {
  return `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
}

function isValidTraceparent(value: string): boolean {
  const [, traceId, spanId] = value.split('-');
  return (
    TRACEPARENT_PATTERN.test(value) &&
    traceId !== EMPTY_TRACE_ID &&
    spanId !== EMPTY_SPAN_ID
  );
}

function getRequestId(suppliedRequestId: string | undefined): string {
  if (suppliedRequestId && REQUEST_ID_PATTERN.test(suppliedRequestId)) {
    return suppliedRequestId;
  }

  return randomUUID();
}

function getTraceparent(suppliedTraceparent: string | undefined): string {
  const normalizedTraceparent = suppliedTraceparent?.toLowerCase();

  if (normalizedTraceparent && isValidTraceparent(normalizedTraceparent)) {
    return normalizedTraceparent;
  }

  return createTraceparent();
}

export function createRequestLogger(logger: Logger): RequestHandler {
  return function requestLogger(request, response, next) {
    const startedAt = performance.now();
    const requestId = getRequestId(request.get('x-request-id'));
    const traceparent = getTraceparent(request.get('traceparent'));
    const [, traceId, spanId] = traceparent.split('-');

    request.requestId = requestId;
    request.traceparent = traceparent;
    request.headers['x-request-id'] = requestId;
    request.headers.traceparent = traceparent;
    request.log = logger.child({
      requestId,
      traceId,
      spanId,
    });
    response.setHeader('x-request-id', requestId);
    response.setHeader('traceparent', traceparent);

    let finished = false;
    response.on('finish', () => {
      finished = true;
      const details = {
        timestamp: new Date().toISOString(),
        method: request.method,
        path: request.path,
        sourceIp: request.ip,
        ...(request.verifiedUser ? { userId: request.verifiedUser } : {}),
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
