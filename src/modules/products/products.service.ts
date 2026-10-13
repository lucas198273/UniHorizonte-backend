import { ConflictError } from '../../shared/errors/ConflictError.js';
import { NotFoundError } from '../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../shared/errors/ValidationError.js';
import { buildMeta } from '../../shared/pagination/pagination.js';
import type { parsePagination } from '../../shared/pagination/pagination.js';
import { slugify } from '../../shared/utils/slug.js';
import { sanitizeHtml } from '../../shared/utils/sanitizeHtml.js';
import type { ProductsRepository } from './products.repository.js';
import type { BlogPostProductsRepository } from '../blog/postProducts.repository.js';
import type { CreateProductInput, PaginatedProducts, UpdateProductInput } from './products.dtos.js';
import type {
  Product,
  ProductLevel,
  ProductModality,
  ProductSort,
  ProductStatus,
} from './products.types.js';
import { ProductCategoriesRepository } from './productCategories.repository.js';

interface ListOptions {
  pagination: ReturnType<typeof parsePagination>;
  categoryId?: string;
  status?: ProductStatus;
  includeDrafts: boolean;
  // Filtros de curso (opcionais)
  modality?: string | string[];
  level?: string | string[];
  certification?: boolean;
  tags?: string | string[];
  minPrice?: number;
  maxPrice?: number;
  minWorkload?: number;
  maxWorkload?: number;
  sort?: ProductSort;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Sentinela interna para "slug de categoria não existe no tenant".
const CATEGORY_NOT_FOUND = Symbol('CATEGORY_NOT_FOUND');

// Normaliza filtro multi-valor: "online,hibrido" | ['online'] | undefined → string[] | undefined.
function normalizeList(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : value.split(',');
  const items = raw.map((v) => v.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

// syllabus pode conter HTML: sanitiza strings; preserva null/undefined/''.
function sanitizeSyllabus(value: string | null | undefined): string | null | undefined {
  if (typeof value !== 'string' || value === '') return value;
  return sanitizeHtml(value);
}

export class ProductsService {
  constructor(
    private readonly repo: ProductsRepository,
    private readonly categoriesRepo: ProductCategoriesRepository,
    private readonly linksRepo: BlogPostProductsRepository,
  ) {}

  async listPublic(tenantId: string, options: ListOptions): Promise<PaginatedProducts> {
    return this.list(tenantId, options);
  }

  async listAdmin(tenantId: string, options: ListOptions): Promise<PaginatedProducts> {
    return this.list(tenantId, options);
  }

  private async resolveCategoryId(
    category: string | undefined,
    tenantId: string,
  ): Promise<string | typeof CATEGORY_NOT_FOUND | null> {
    if (!category) return null;
    if (UUID_RE.test(category)) return category; // UUID válido: usa direto
    const cat = await this.categoriesRepo.findBySlug(category, tenantId);
    if (!cat) return CATEGORY_NOT_FOUND;
    return cat.id;
  }

  private async list(tenantId: string, options: ListOptions): Promise<PaginatedProducts> {
    const categoryId = await this.resolveCategoryId(options.categoryId, tenantId);
    if (categoryId === CATEGORY_NOT_FOUND) {
      // Slug não existe no tenant: lista vazia (não 404, para não quebrar front).
      return {
        items: [],
        meta: buildMeta(0, options.pagination.page, options.pagination.limit),
      };
    }
    const { items, total } = await this.repo.list(tenantId, {
      pagination: options.pagination,
      categoryId: categoryId ?? undefined,
      status: options.status,
      includeDrafts: options.includeDrafts,
      modality: normalizeList(options.modality) as ProductModality[] | undefined,
      level: normalizeList(options.level) as ProductLevel[] | undefined,
      certification: options.certification,
      tags: normalizeList(options.tags),
      minPrice: options.minPrice,
      maxPrice: options.maxPrice,
      minWorkload: options.minWorkload,
      maxWorkload: options.maxWorkload,
      sort: options.sort,
    });
    return {
      items,
      meta: buildMeta(total, options.pagination.page, options.pagination.limit),
    };
  }

  async getById(id: string, tenantId: string, publicOnly: boolean): Promise<Product> {
    const product = await this.repo.findById(id, tenantId);
    if (!product) throw new NotFoundError('Product not found');
    if (publicOnly && product.status !== 'active') throw new NotFoundError('Product not found');
    return product;
  }

  async getBySlug(slug: string, tenantId: string, publicOnly: boolean): Promise<Product> {
    const product = await this.repo.findBySlug(slug, tenantId);
    if (!product) throw new NotFoundError('Product not found');
    if (publicOnly && product.status !== 'active') throw new NotFoundError('Product not found');
    return product;
  }

  async create(tenantId: string, input: CreateProductInput): Promise<Product> {
    const slug = input.slug ?? slugify(input.nome);
    if (!slug) throw new ValidationError('Could not generate a valid slug');

    if (await this.repo.findBySlug(slug, tenantId)) {
      throw new ConflictError(`Slug "${slug}" already exists in this tenant`);
    }
    if (input.sku && (await this.repo.findBySku(input.sku, tenantId))) {
      throw new ConflictError(`SKU "${input.sku}" already exists in this tenant`);
    }
    if (input.category_id) {
      await this.assertCategoryInTenant(input.category_id, tenantId);
    }

    return this.repo.insert({
      ...input,
      slug,
      tenant_id: tenantId,
      images: input.images ?? [],
      status: input.status ?? 'draft',
      syllabus: sanitizeSyllabus(input.syllabus),
    });
  }

  async update(id: string, tenantId: string, input: UpdateProductInput): Promise<Product> {
    const current = await this.repo.findById(id, tenantId);
    if (!current) throw new NotFoundError('Product not found');

    if (input.slug && input.slug !== current.slug) {
      if (await this.repo.findBySlug(input.slug, tenantId)) {
        throw new ConflictError(`Slug "${input.slug}" already exists in this tenant`);
      }
    }
    if (input.sku && input.sku !== current.sku) {
      if (await this.repo.findBySku(input.sku, tenantId)) {
        throw new ConflictError(`SKU "${input.sku}" already exists in this tenant`);
      }
    }
    if (input.category_id) {
      await this.assertCategoryInTenant(input.category_id, tenantId);
    }

    return this.repo.update(id, tenantId, {
      ...input,
      syllabus: sanitizeSyllabus(input.syllabus),
    });
  }

  async delete(id: string, tenantId: string, force: boolean): Promise<void> {
    const product = await this.repo.findById(id, tenantId);
    if (!product) throw new NotFoundError('Product not found');

    const linkedPosts = await this.linksRepo.countByProduct(id);
    if (linkedPosts > 0 && !force) {
      throw new ConflictError(
        `Produto está associado a ${linkedPosts} post(s). Use ?force=true para forçar.`,
      );
    }

    await this.repo.delete(id, tenantId);
  }

  private async assertCategoryInTenant(categoryId: string, tenantId: string): Promise<void> {
    const category = await this.categoriesRepo.findById(categoryId, tenantId);
    if (!category) throw new ValidationError('category_id does not exist in this tenant');
  }
}
