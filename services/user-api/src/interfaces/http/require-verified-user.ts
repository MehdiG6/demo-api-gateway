import type { RequestHandler } from 'express';

export const requireVerifiedUser: RequestHandler = (
  request,
  response,
  next,
) => {
  if (!request.get('x-verified-user')) {
    request.log.warn('Request rejected: verified user header missing');
    response.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
};
