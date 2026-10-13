import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { ok } from '../../shared/http/HttpResponse.js';
import { authMiddleware } from '../../shared/middleware/auth.middleware.js';
import { requireRole } from '../../shared/middleware/requireRole.middleware.js';
import { optionalAuth } from '../../shared/middleware/optionalAuth.middleware.js';
import { resolveTenantBySlugIfAnonymous } from '../../shared/middleware/resolveTenant.middleware.js';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware.js';
import { validateBody } from '../../shared/middleware/validateBody.js';
import { ProductCategoriesRepository } from './productCategories.repository.js';
import { ProductCategoriesService } from './productCategories.service.js';
import {
  createProductCategorySchema,
  updateProductCategorySchema,
} from './productCategories.validation.js';

const repo = new ProductCategoriesRepository(supabase);
const service = new ProductCategoriesService(repo);

export const productCategoriesRoutes = Router();

// ---- Públicas (auth-aware: header X-Tenant-Slug só quando anônimo) ----
productCategoriesRoutes.get(
  '/',
  optionalAuth,
  resolveTenantBySlugIfAnonymous(),
  async (req, res) => {
    const items = await service.listWithProductCount(req.tenantId as string);
    ok(res, items);
  },
);

productCategoriesRoutes.get(
  '/:slugOrId',
  optionalAuth,
  resolveTenantBySlugIfAnonymous(),
  async (req, res) => {
    const category = await service.getBySlugOrId(req.params.slugOrId as string, req.tenantId as string);
    ok(res, category);
  },
);

// ---- Admin ----
productCategoriesRoutes.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  validateBody(createProductCategorySchema),
  async (req, res) => {
    const category = await service.create(req.tenantId as string, req.body);
    ok(res, category, 'Created', 201);
  },
);

productCategoriesRoutes.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  validateBody(updateProductCategorySchema),
  async (req, res) => {
    const category = await service.update(req.params.id as string, req.tenantId as string, req.body);
    ok(res, category, 'Updated');
  },
);

productCategoriesRoutes.delete(
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
