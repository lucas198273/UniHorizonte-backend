import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../errors/UnauthorizedError.js';

// Garante que a rota só execute com tenant resolvido pelo authMiddleware.
// Rotas públicas NÃO passam por aqui — o tenant de rotas públicas é
// resolvido por header/query no módulo (ver docs/architecture.md).
export const tenantMiddleware: RequestHandler = (req, _res, next) => {
  if (!req.tenantId) {
    next(new UnauthorizedError('Tenant not resolved'));
    return;
  }
  next();
};
