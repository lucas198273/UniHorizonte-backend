import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { ok } from '../../shared/http/HttpResponse.js';
import { authMiddleware } from '../../shared/middleware/auth.middleware.js';
import { optionalAuth } from '../../shared/middleware/optionalAuth.middleware.js';
import { requireRole } from '../../shared/middleware/requireRole.middleware.js';
import { resolveTenantBySlugIfAnonymous } from '../../shared/middleware/resolveTenant.middleware.js';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware.js';
import { parsePagination } from '../../shared/pagination/pagination.js';
import { validateBody } from '../../shared/middleware/validateBody.js';
import { validateQuery } from '../../shared/middleware/validateBody.js';
import { ProductsRepository } from './products.repository.js';
import { ProductsService } from './products.service.js';
import { ProductCategoriesRepository } from './productCategories.repository.js';
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from './products.validation.js';
import { BlogPostProductsRepository } from '../blog/postProducts.repository.js';
import type { ProductSort } from './products.types.js';
import { uuidSchema } from '../../shared/validation/commonSchemas.js';

const repo = new ProductsRepository(supabase);
const categoriesRepo = new ProductCategoriesRepository(supabase);
const linksRepo = new BlogPostProductsRepository(supabase);
const service = new ProductsService(repo, categoriesRepo, linksRepo);

export const productsRoutes = Router();

// Filtros de curso da query string (todos opcionais).
interface ListFilterQuery {
  modality?: string | string[];
  level?: string | string[];
  certification?: boolean;
  tags?: string | string[];
  min_price?: number;
  max_price?: number;
  min_workload?: number;
  max_workload?: number;
  sort?: ProductSort;
}

// Mapeia snake_case da query pros nomes do service (camelCase).
function listFilters(q: ListFilterQuery) {
  return {
    modality: q.modality,
    level: q.level,
    certification: q.certification,
    tags: q.tags,
    minPrice: q.min_price,
    maxPrice: q.max_price,
    minWorkload: q.min_workload,
    maxWorkload: q.max_workload,
    sort: q.sort,
  };
}

// ---- Públicas (só status=active) ----
productsRoutes.get(
  '/',
  optionalAuth,
  resolveTenantBySlugIfAnonymous(),
  validateQuery(listProductsQuerySchema),
  async (req, res) => {
    const q = req.query as {
      category?: string;
      status?: 'draft' | 'active' | 'archived';
      modality?: string | string[];
      level?: string | string[];
      certification?: boolean;
      tags?: string | string[];
      min_price?: number;
      max_price?: number;
      min_workload?: number;
      max_workload?: number;
      sort?: ProductSort;
    };
    const authenticated = req.user !== undefined;
    const result = await service.listPublic(req.tenantId as string, {
      pagination: parsePagination(req.query),
      categoryId: q.category,
      status: authenticated ? q.status : undefined,
      includeDrafts: authenticated,
      ...listFilters(q),
    });
    ok(res, result);
  },
);

productsRoutes.get(
  '/:idOrSlug',
  optionalAuth,
  resolveTenantBySlugIfAnonymous(),
  async (req, res) => {
    const key = req.params.idOrSlug as string;
    const publicOnly = req.user === undefined;
    const isUuid = uuidSchema.validate(key).error === undefined;
    const product = isUuid
      ? await service.getById(key, req.tenantId as string, publicOnly)
      : await service.getBySlug(key, req.tenantId as string, publicOnly);
    ok(res, product);
  },
);

// ---- Admin ----
productsRoutes.get(
  '/admin/list',
  optionalAuth, // tenta validar Bearer, sem bloquear
  resolveTenantBySlugIfAnonymous(), // resolve tenant por slug se anonimo
  tenantMiddleware, // garante req.tenantId
  requireRole(['admin', 'editor']),
  validateQuery(listProductsQuerySchema),
  async (req, res) => {
    const q = req.query as { category?: string } & ListFilterQuery;
    const result = await service.listAdmin(req.tenantId as string, {
      pagination: parsePagination(req.query),
      categoryId: q.category,
      includeDrafts: true,
      ...listFilters(q),
    });
    ok(res, result);
  },
);

productsRoutes.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  validateBody(createProductSchema),
  async (req, res) => {
    const product = await service.create(req.tenantId as string, req.body);
    ok(res, product, 'Created', 201);
  },
);

productsRoutes.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  validateBody(updateProductSchema),
  async (req, res) => {
    const product = await service.update(req.params.id as string, req.tenantId as string, req.body);
    ok(res, product, 'Updated');
  },
);

productsRoutes.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin']),
  async (req, res) => {
    const force = req.query.force === 'true';
    await service.delete(req.params.id as string, req.tenantId as string, force);
    ok(res, { id: req.params.id }, 'Deleted');
  },
);
