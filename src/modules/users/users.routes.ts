import { Router } from 'express';
import { supabase } from '../../config/supabase.js';
import { ok } from '../../shared/http/HttpResponse.js';
import { authMiddleware } from '../../shared/middleware/auth.middleware.js';
import { requireRole } from '../../shared/middleware/requireRole.middleware.js';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware.js';
import { parsePagination } from '../../shared/pagination/pagination.js';
import { validateBody, validateQuery } from '../../shared/middleware/validateBody.js';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from './users.validation.js';

const repo = new UsersRepository(supabase);
const service = new UsersService(repo, supabase);

export const usersRoutes = Router();

// Perfil do usuário logado (qualquer role autenticada)
usersRoutes.get(
  '/me',
  authMiddleware,
  tenantMiddleware,
  async (req, res) => {
    const profile = await service.getMe(req.user?.id as string, req.tenantId as string);
    ok(res, profile);
  },
);

// ---- Somente admin ----
usersRoutes.get(
  '/',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin']),
  validateQuery(listUsersQuerySchema),
  async (req, res) => {
    const result = await service.list(req.tenantId as string, parsePagination(req.query));
    ok(res, result);
  },
);

usersRoutes.get(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin']),
  async (req, res) => {
    const profile = await service.getById(req.params.id as string, req.tenantId as string);
    ok(res, profile);
  },
);

usersRoutes.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin']),
  validateBody(createUserSchema),
  async (req, res) => {
    const profile = await service.create(req.tenantId as string, req.body);
    ok(res, profile, 'Created', 201);
  },
);

usersRoutes.put(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin']),
  validateBody(updateUserSchema),
  async (req, res) => {
    const profile = await service.update(req.params.id as string, req.tenantId as string, req.body);
    ok(res, profile, 'Updated');
  },
);

usersRoutes.delete(
  '/:id',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin']),
  async (req, res) => {
    // Soft delete (ativo=false). Hard delete no auth.users é operação manual.
    await service.delete(req.params.id as string, req.tenantId as string);
    ok(res, { id: req.params.id }, 'Deactivated');
  },
);
