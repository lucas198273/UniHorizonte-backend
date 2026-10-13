import Joi from 'joi';
import { slugSchema, uuidSchema } from '../../shared/validation/commonSchemas.js';

export const createProductCategorySchema = Joi.object({
  nome: Joi.string().trim().min(1).max(120).required(),
  slug: slugSchema.optional(),
  descricao: Joi.string().max(2000).allow('', null).optional(),
  parent_id: uuidSchema.allow(null).optional(),
  display_order: Joi.number().integer().min(0).optional(),
});

export const updateProductCategorySchema = Joi.object({
  nome: Joi.string().trim().min(1).max(120).optional(),
  slug: slugSchema.optional(),
  descricao: Joi.string().max(2000).allow('', null).optional(),
  parent_id: uuidSchema.allow(null).optional(),
  display_order: Joi.number().integer().min(0).optional(),
  status: Joi.string().valid('active', 'archived').optional(),
}).min(1);
