import Joi from 'joi';
import { paginationSchema, slugSchema, uuidSchema } from '../../shared/validation/commonSchemas.js';

const imageSchema = Joi.object({
  url: Joi.string().uri().required(),
  alt: Joi.string().max(200).optional(),
  displayOrder: Joi.number().integer().min(0).default(0),
});

// Campos de curso (migration 0002) — compartilhados entre create e update, todos opcionais.
// Datas usam .raw() para manter a string ISO original (tipo string no DTO), em vez de Date.
const courseFields = {
  kind: Joi.string().valid('product', 'course').optional(),
  modality: Joi.string().valid('presencial', 'online', 'hibrido').allow(null).optional(),
  workload_hours: Joi.number().integer().positive().allow(null).optional(),
  duration_months: Joi.number().integer().positive().allow(null).optional(),
  level: Joi.string().valid('iniciante', 'intermediario', 'avancado').allow(null).optional(),
  certification: Joi.boolean().optional(),
  certification_name: Joi.string().trim().max(200).allow(null, '').optional(),
  start_date: Joi.date().iso().raw().allow(null).optional(),
  enrollment_deadline: Joi.date().iso().raw().allow(null).optional(),
  syllabus: Joi.string().allow(null, '').optional(), // texto livre/HTML — sanitizado no service
  requirements: Joi.string().allow(null, '').optional(),
  coordinator_name: Joi.string().trim().max(200).allow(null, '').optional(),
  coordinator_bio: Joi.string().max(1000).allow(null, '').optional(),
  coordinator_photo_url: Joi.string().uri().allow(null, '').optional(),
  video_url: Joi.string().uri().allow(null, '').optional(),
  tags: Joi.array().items(Joi.string().trim().max(40)).max(20).optional(),
};

export const createProductSchema = Joi.object({
  nome: Joi.string().trim().min(1).max(200).required(),
  slug: slugSchema.optional(),
  sku: Joi.string().trim().max(60).allow(null).optional(),
  descricao: Joi.string().max(10000).allow('', null).optional(),
  preco: Joi.number().precision(2).greater(0).allow(null).optional(),
  category_id: uuidSchema.allow(null).optional(),
  images: Joi.array().items(imageSchema).max(20).optional(),
  status: Joi.string().valid('draft', 'active', 'archived').optional(),
  display_order: Joi.number().integer().min(0).optional(),
  featured: Joi.boolean().default(false),
  meta_title: Joi.string().max(200).optional(),
  meta_description: Joi.string().max(500).optional(),
  ...courseFields,
});

export const updateProductSchema = Joi.object({
  nome: Joi.string().trim().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  sku: Joi.string().trim().max(60).allow(null).optional(),
  descricao: Joi.string().max(10000).allow('', null).optional(),
  preco: Joi.number().precision(2).greater(0).allow(null).optional(),
  category_id: uuidSchema.allow(null).optional(),
  images: Joi.array().items(imageSchema).max(20).optional(),
  status: Joi.string().valid('draft', 'active', 'archived').optional(),
  display_order: Joi.number().integer().min(0).optional(),
  featured: Joi.boolean().optional(),
  meta_title: Joi.string().max(200).allow(null).optional(),
  meta_description: Joi.string().max(500).allow(null).optional(),
  ...courseFields,
}).min(1);

// Valores válidos dos campos multi-valor (aceitam "a,b" ou array explícito).
const MODALITIES = ['presencial', 'online', 'hibrido'] as const;
const LEVELS = ['iniciante', 'intermediario', 'avancado'] as const;
const SORTS = [
  'newest',
  'oldest',
  'price_asc',
  'price_desc',
  'name_asc',
  'name_desc',
  'display_order',
] as const;

// Já valida o enum em cada item, então um valor inválido derruba o filtro
// (ex: modality=xyz → 400). O split por vírgula é feito no service.
const enumList = (allowed: readonly string[]) =>
  Joi.alternatives()
    .try(Joi.string().trim(), Joi.array().items(Joi.string().trim()))
    .custom((value: string | string[]) => {
      const items = (Array.isArray(value) ? value : value.split(','))
        .map((v) => v.trim())
        .filter(Boolean);
      const invalid = items.filter((v) => !allowed.includes(v));
      if (invalid.length) throw new Error(`valores inválidos: ${invalid.join(', ')}`);
      return value;
    })
    .optional();

// tags é texto livre: aceita string ("a,b") ou array explícito, sem enum.

export const listProductsQuerySchema = Joi.object({
  ...paginationSchema,
  // Aceita UUID ou slug de categoria (resolvido no service — retrocompatível).
  category: Joi.string().trim().min(1).max(200).optional(),
  status: Joi.string().valid('draft', 'active', 'archived').optional(),

  // Filtros de curso (todos opcionais e retrocompatíveis).
  modality: enumList(MODALITIES),
  level: enumList(LEVELS),
  certification: Joi.boolean().optional(),
  tags: Joi.alternatives()
    .try(Joi.string().trim(), Joi.array().items(Joi.string().trim()))
    .optional(),
  min_price: Joi.number().min(0).optional(),
  max_price: Joi.number().min(0).optional(),
  min_workload: Joi.number().integer().min(0).optional(),
  max_workload: Joi.number().integer().min(0).optional(),
  sort: Joi.string().valid(...SORTS).optional(),
}).custom((value: Record<string, unknown>) => {
  const min = value.min_price as number | undefined;
  const max = value.max_price as number | undefined;
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error('min_price não pode ser maior que max_price');
  }
  const minW = value.min_workload as number | undefined;
  const maxW = value.max_workload as number | undefined;
  if (minW !== undefined && maxW !== undefined && minW > maxW) {
    throw new Error('min_workload não pode ser maior que max_workload');
  }
  return value;
});
