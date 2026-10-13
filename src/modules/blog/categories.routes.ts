import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { authMiddleware } from '../../shared/middleware/auth.middleware.js';
import { requireRole } from '../../shared/middleware/requireRole.middleware.js';
import { optionalAuth } from '../../shared/middleware/optionalAuth.middleware.js';
import { resolveTenantBySlugIfAnonymous } from '../../shared/middleware/resolveTenant.middleware.js';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware.js';
import { validateBody } from '../../shared/middleware/validateBody.js';
import { ok } from '../../shared/http/HttpResponse.js';
import { BlogCategoriesRepository } from './categories.repository.js';
import { BlogCategoriesService } from './categories.service.js';
import {
  createBlogCategorySchema,
  updateBlogCategorySchema,
} from './categories.validation.js';

const repo = new BlogCategoriesRepository(supabase);
const service = new BlogCategoriesService(repo);

export const blogCategoriesRoutes = Router();

// ---- Públicas (auth-aware: header X-Tenant-Slug só quando anônimo) ----
blogCategoriesRoutes.get(
  '/',
  optionalAuth,
  resolveTenantBySlugIfAnonymous(),
  async (req, res) => {
    const items = await service.listWithPostCount(req.tenantId as string, false); // públicas: só ativas
    ok(res, items);
  },
);

blogCategoriesRoutes.get(
  '/:slugOrId',
  optionalAuth,
  resolveTenantBySlugIfAnonymous(),
  async (req, res) => {
    const category = await service.getBySlugOrId(req.params.slugOrId as string, req.tenantId as string);
    ok(res, category);
  },
);

// ---- Admin ----
blogCategoriesRoutes.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  validateBody(createBlogCategorySchema),
  async (req, res) => {
    const category = await service.create(req.tenantId as string, req.body);
    ok(res, category, 'Created', 201);
  },
);

blogCategoriesRoutes.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  validateBody(updateBlogCategorySchema),
  async (req, res) => {
    const category = await service.update(req.params.id as string, req.tenantId as string, req.body);
    ok(res, category, 'Updated');
  },
);

blogCategoriesRoutes.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  async (req, res) => {
    const force = req.query.force === 'true';
    await service.delete(req.params.id as string, req.tenantId as string, force);
    ok(res, { id: req.params.id }, 'Deleted');
  },
);
