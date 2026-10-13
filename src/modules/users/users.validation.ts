import Joi from 'joi';
import { paginationSchema, uuidSchema } from '../../shared/validation/commonSchemas.js';

export const createUserSchema = Joi.object({
  nome: Joi.string().trim().min(1).max(120).required(),
  email: Joi.string().email().max(200).required(),
  role: Joi.string().valid('admin', 'editor', 'user').required(),
  password: Joi.string().min(8).max(72).required(),
});

export const updateUserSchema = Joi.object({
  nome: Joi.string().trim().min(1).max(120).optional(),
  role: Joi.string().valid('admin', 'editor', 'user').optional(),
  ativo: Joi.boolean().optional(),
}).min(1);

export const userIdParamsSchema = Joi.object({
  id: uuidSchema.required(),
});

export const listUsersQuerySchema = Joi.object(paginationSchema);
