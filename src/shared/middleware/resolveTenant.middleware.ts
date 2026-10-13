import type { RequestHandler } from 'express';
import { supabase } from '../../config/supabase.js';
import { UnauthorizedError } from '../errors/UnauthorizedError.js';

// Rotas públicas não têm JWT com tenant. O tenant é resolvido pelo
// header X-Tenant-Slug (ou pelo authMiddleware, que o sobrescreve).
export function resolveTenantBySlugIfAnonymous(headerName = 'x-tenant-slug'): RequestHandler {
  return (req, res, next) => {
    if (req.user && req.tenantId) {
      next();
      return;
    }
    resolveTenantBySlug(headerName)(req, res, next);
  };
}

export function resolveTenantBySlug(headerName = 'x-tenant-slug'): RequestHandler {
  return (req, _res, next) => {
    const slug = req.header(headerName);
    if (!slug) {
      next(new UnauthorizedError('Missing tenant identification'));
      return;
    }

    void (async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, status')
        .eq('slug', slug)
        .single();

      if (error || !data || data.status !== 'active') {
        next(new UnauthorizedError('Unknown or inactive tenant'));
        return;
      }
      req.tenantId = data.id as string;
      next();
    })();
  };
}
