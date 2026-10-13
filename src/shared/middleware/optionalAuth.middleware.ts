import type { RequestHandler } from 'express';
import { supabase } from '../../config/supabase.js';

/** Autenticação opcional: credenciais inválidas são tratadas como visitante. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice('Bearer '.length);
  void supabase.auth.getUser(token).then(({ data, error }) => {
    if (error || !data.user) {
      next();
      return;
    }

    const metadata = (data.user.app_metadata ?? {}) as Record<string, unknown>;
    const tenantId = typeof metadata['tenant_id'] === 'string' ? metadata['tenant_id'] : undefined;
    if (!tenantId) {
      next();
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
  });
};
