import type { RequestHandler } from 'express';
import { supabase } from '../../config/supabase.js';
import { UnauthorizedError } from '../errors/UnauthorizedError.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

// Valida o JWT do Supabase e popula req.user, req.tenantId, req.role.
// tenant_id e role vêm de app_metadata (admin-only no Supabase).
export const authMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing bearer token'));
    return;
  }
  const token = header.slice('Bearer '.length);

  void (async () => {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      next(new UnauthorizedError('Invalid or expired token'));
      return;
    }

    const metadata = (data.user.app_metadata ?? {}) as Record<string, unknown>;
    const tenantId = typeof metadata['tenant_id'] === 'string' ? metadata['tenant_id'] : undefined;
    if (!tenantId) {
      next(new UnauthorizedError('Token has no tenant association'));
      return;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? '',
      role: typeof metadata['role'] === 'string' ? metadata['role'] : 'user',
    };
    req.tenantId = tenantId;
    req.role = req.user.role;
    next();
  })();
};
