import Joi from 'joi';
import { paginationSchema, slugSchema, uuidSchema } from '../../shared/validation/commonSchemas.js';

export const createPostSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  slug: slugSchema.optional(),
  excerpt: Joi.string().max(500).allow('', null).optional(),
  content: Joi.string().min(1).required(),
  cover_image_url: Joi.string().uri().allow(null).optional(),
  status: Joi.string().valid('draft', 'published', 'archived').optional(),
  featured: Joi.boolean().default(false),
  tags: Joi.array().items(Joi.string().trim().max(40)).max(20).optional(),
  category_id: uuidSchema.allow(null).optional(),
  meta_title: Joi.string().max(200).optional(),
  meta_description: Joi.string().max(500).optional(),
  og_image_url: Joi.string().uri().allow(null).optional(),
});

export const updatePostSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  excerpt: Joi.string().max(500).allow('', null).optional(),
  content: Joi.string().min(1).optional(),
  cover_image_url: Joi.string().uri().allow(null).optional(),
  status: Joi.string().valid('draft', 'published', 'archived').optional(),
  featured: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string().trim().max(40)).max(20).optional(),
  category_id: uuidSchema.allow(null).optional(),
  meta_title: Joi.string().max(200).allow(null).optional(),
  meta_description: Joi.string().max(500).allow(null).optional(),
  og_image_url: Joi.string().uri().allow(null).optional(),
}).min(1);

export const listPostsQuerySchema = Joi.object({
  ...paginationSchema,
  // Aceita UUID ou slug de categoria (resolvido no service — retrocompatível).
  category: Joi.string().trim().min(1).max(200).optional(),
  tag: Joi.string().trim().max(40).optional(),
  featured: Joi.boolean().optional(),
  status: Joi.string().valid('draft', 'published', 'archived').optional(),
});
