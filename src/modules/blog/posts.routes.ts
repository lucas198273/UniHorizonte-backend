import { Router } from 'express';
import Joi from 'joi';
import { supabase } from '../../config/supabase.js';
import { ok } from '../../shared/http/HttpResponse.js';
import { authMiddleware } from '../../shared/middleware/auth.middleware.js';
import { optionalAuth } from '../../shared/middleware/optionalAuth.middleware.js';
import { requireRole } from '../../shared/middleware/requireRole.middleware.js';
import { resolveTenantBySlugIfAnonymous } from '../../shared/middleware/resolveTenant.middleware.js';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware.js';
import { parsePagination } from '../../shared/pagination/pagination.js';
import { validateBody, validateQuery } from '../../shared/middleware/validateBody.js';
import { uuidSchema } from '../../shared/validation/commonSchemas.js';
import { BlogPostsRepository } from './posts.repository.js';
import { BlogPostsService } from './posts.service.js';
import { BlogCategoriesRepository } from './categories.repository.js';
import { BlogPostProductsRepository } from './postProducts.repository.js';
import { BlogPostProductsService } from './postProducts.service.js';
import { ProductsRepository } from '../products/products.repository.js';
import { SupabaseStorageRepository } from '../../shared/storage/SupabaseStorageRepository.js';
import { StorageService } from '../../shared/storage/StorageService.js';
import { createPostSchema, listPostsQuerySchema, updatePostSchema } from './posts.validation.js';

const postsRepo = new BlogPostsRepository(supabase);
const categoriesRepo = new BlogCategoriesRepository(supabase);
const linksRepo = new BlogPostProductsRepository(supabase);
// Storage: usado pela limpeza automática da capa antiga (update/delete).
const storageRepo = new SupabaseStorageRepository(supabase);
const storage = new StorageService(storageRepo);
const postsService = new BlogPostsService(postsRepo, categoriesRepo, linksRepo, storage, storageRepo);

const productsRepo = new ProductsRepository(supabase);
const linksService = new BlogPostProductsService(linksRepo, postsRepo, productsRepo);

const associateSchema = Joi.object({
  product_ids: Joi.array().items(uuidSchema).min(1).required(),
});

export const blogPostsRoutes = Router();

// ---- Públicas (só published) ----
blogPostsRoutes.get(
  '/',
  optionalAuth,
  resolveTenantBySlugIfAnonymous(),
  validateQuery(listPostsQuerySchema),
  async (req, res) => {
    const q = req.query as { category?: string; tag?: string; featured?: boolean; status?: 'draft' | 'published' | 'archived' };
    const authenticated = req.user !== undefined;
    const result = await postsService.list(req.tenantId as string, {
      pagination: parsePagination(req.query),
      categoryId: q.category,
      tag: q.tag,
      featured: q.featured,
      status: authenticated ? q.status : undefined,
      publishedOnly: !authenticated,
    });
    ok(res, result);
  },
);

blogPostsRoutes.get(
  '/:idOrSlug',
  optionalAuth,
  resolveTenantBySlugIfAnonymous(),
  async (req, res) => {
    const key = req.params.idOrSlug as string;
    const publicOnly = req.user === undefined;
    const isUuid = uuidSchema.validate(key).error === undefined;
    const post = isUuid
      ? await postsService.getById(key, req.tenantId as string, publicOnly)
      : await postsService.getBySlug(key, req.tenantId as string, publicOnly);
    ok(res, post);
  },
);

// ---- Admin ----
blogPostsRoutes.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  validateBody(createPostSchema),
  async (req, res) => {
    const post = await postsService.create(req.tenantId as string, req.user?.id ?? null, req.body);
    ok(res, post, 'Created', 201);
  },
);

blogPostsRoutes.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  validateBody(updatePostSchema),
  async (req, res) => {
    const post = await postsService.update(
      req.params.id as string,
      req.tenantId as string,
      req.user?.id ?? null,
      req.body,
    );
    ok(res, post, 'Updated');
  },
);

blogPostsRoutes.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  async (req, res) => {
    const force = req.query.force === 'true';
    await postsService.delete(req.params.id as string, req.tenantId as string, force);
    ok(res, { id: req.params.id }, 'Deleted');
  },
);

// ---- Associação post ↔ produtos ----
blogPostsRoutes.post(
  '/:id/products',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  validateBody(associateSchema),
  async (req, res) => {
    await linksService.associate(req.params.id as string, req.tenantId as string, req.body.product_ids);
    ok(res, { post_id: req.params.id }, 'Associated');
  },
);

blogPostsRoutes.get(
  '/:id/products',
  optionalAuth,
  resolveTenantBySlugIfAnonymous(),
  async (req, res) => {
    const products = await linksService.listProducts(
      req.params.id as string,
      req.tenantId as string,
      req.user !== undefined,
    );
    ok(res, products);
  },
);

blogPostsRoutes.delete(
  '/:id/products/:productId',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  async (req, res) => {
    await linksService.dissociate(
      req.params.id as string,
      req.params.productId as string,
      req.tenantId as string,
    );
    ok(res, { post_id: req.params.id, product_id: req.params.productId }, 'Dissociated');
  },
);
