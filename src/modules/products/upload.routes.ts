import { Router } from 'express';
import multer from 'multer';
import { supabase } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import { ok } from '../../shared/http/HttpResponse.js';
import { authMiddleware } from '../../shared/middleware/auth.middleware.js';
import { tenantMiddleware } from '../../shared/middleware/tenant.middleware.js';
import { requireRole } from '../../shared/middleware/requireRole.middleware.js';
import { SupabaseStorageRepository } from '../../shared/storage/SupabaseStorageRepository.js';
import { StorageService } from '../../shared/storage/StorageService.js';
import { ValidationError } from '../../shared/errors/ValidationError.js';

const repo = new SupabaseStorageRepository(supabase);
const storage = new StorageService(repo);

// memoryStorage — o buffer fica em memória (ok para ≤5MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadSizeMb * 1024 * 1024,
    files: 1,
  },
});

export const productsUploadRoutes = Router();

productsUploadRoutes.post(
  '/',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) throw new ValidationError('Nenhum arquivo enviado');

    const result = await storage.uploadImage(
      env.productStorageBucket,
      req.tenantId as string,
      req.file.buffer,
      env.maxUploadSizeMb * 1024 * 1024,
    );
    ok(res, result, 'Upload realizado', 201);
  },
);

productsUploadRoutes.delete(
  '/',
  authMiddleware,
  tenantMiddleware,
  requireRole(['admin', 'editor']),
  async (req, res) => {
    const { path } = req.body as { path?: string };
    if (!path) throw new ValidationError('Campo "path" é obrigatório');

    await storage.deleteImage(env.productStorageBucket, req.tenantId as string, path);
    ok(res, { path }, 'Imagem removida');
  },
);
