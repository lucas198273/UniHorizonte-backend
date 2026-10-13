import type { RequestHandler } from 'express';
import { ForbiddenError } from '../errors/ForbiddenError.js';
import { UnauthorizedError } from '../errors/UnauthorizedError.js';

export function requireRole(allowed: string[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!allowed.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient role'));
      return;
    }
    next();
  };
}
