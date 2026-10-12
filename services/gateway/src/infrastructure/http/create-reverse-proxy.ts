import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { OutgoingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { RequestHandler } from 'express';

export function createReverseProxy(backendUrl: string): RequestHandler {
  const backend = new URL(backendUrl);
  const sendRequest =
    backend.protocol === 'https:' ? httpsRequest : httpRequest;

  return function reverseProxy(request, response) {
    const target = new URL(request.originalUrl, backend);
    const [version, traceId, , flags] = request.traceparent.split('-');
    const headers: OutgoingHttpHeaders = {
      host: target.host,
      'x-request-id': request.requestId,
      traceparent: `${version}-${traceId}-${randomBytes(8).toString('hex')}-${flags}`,
      ...(request.verifiedUser
        ? { 'x-verified-user': request.verifiedUser }
        : {}),
      ...(request.headers.accept
        ? { accept: request.headers.accept }
        : {}),
      ...(request.headers['content-type']
        ? { 'content-type': request.headers['content-type'] }
        : {}),
      ...(request.headers['content-length']
        ? { 'content-length': request.headers['content-length'] }
        : {}),
    };

    const upstreamRequest = sendRequest(
      target,
      { method: request.method, headers },
      (upstreamResponse) => {
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          upstreamResponse.headers,
        );
        upstreamResponse.pipe(response);
      },
    );

    upstreamRequest.on('error', (error) => {
      request.log.error({ err: error }, 'Backend proxy failed');
      if (!response.headersSent) {
        response.status(502).json({ error: 'Bad Gateway' });
      } else {
        response.destroy(error);
      }
    });

    request.pipe(upstreamRequest);
  };
}
