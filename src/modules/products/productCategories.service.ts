import { ConflictError } from '../../shared/errors/ConflictError.js';
import { NotFoundError } from '../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../shared/errors/ValidationError.js';
import { slugify } from '../../shared/utils/slug.js';
import type { ProductCategoriesRepository } from './productCategories.repository.js';
import type {
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
} from './productCategories.dtos.js';
import type {
  ProductCategory,
  ProductCategoryWithCount,
} from './productCategories.types.js';

export class ProductCategoriesService {
  constructor(private readonly repo: ProductCategoriesRepository) { }

  async list(tenantId: string): Promise<ProductCategory[]> {
    return this.repo.listActive(tenantId);
  }

  // Listagem com contagem de produtos ativos por categoria.
  // Uma única query extra (contagem agrupada), sem N+1.
  async listWithProductCount(tenantId: string): Promise<ProductCategoryWithCount[]> {
    const [items, counts] = await Promise.all([
      this.repo.listActive(tenantId),
      this.repo.countActiveProductsGrouped(tenantId),
    ]);
    return items.map((c) => ({ ...c, product_count: counts.get(c.id) ?? 0 }));
  }

  async getBySlugOrId(slugOrId: string, tenantId: string): Promise<ProductCategory> {
    const byId = await this.repo.findById(slugOrId, tenantId);
    const category = byId ?? (await this.repo.findBySlug(slugOrId, tenantId));
    if (!category) throw new NotFoundError('Category not found');
    return category;
  }

  async create(tenantId: string, input: CreateProductCategoryInput): Promise<ProductCategory> {
    const slug = input.slug ?? slugify(input.nome);
    if (!slug) throw new ValidationError('Could not generate a valid slug');

    if (await this.repo.findBySlug(slug, tenantId)) {
      throw new ConflictError(`Slug "${slug}" already exists in this tenant`);
    }
    if (input.parent_id) {
      const parent = await this.repo.findById(input.parent_id, tenantId);
      if (!parent) throw new ValidationError('parent_id does not exist in this tenant');
    }

    return this.repo.insert({ ...input, slug, tenant_id: tenantId });
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateProductCategoryInput,
  ): Promise<ProductCategory> {
    const current = await this.repo.findById(id, tenantId);
    if (!current) throw new NotFoundError('Category not found');

    if (input.slug && input.slug !== current.slug) {
      if (await this.repo.findBySlug(input.slug, tenantId)) {
        throw new ConflictError(`Slug "${input.slug}" already exists in this tenant`);
      }
    }
    if (input.parent_id) {
      if (input.parent_id === id) throw new ValidationError('A category cannot be its own parent');
      const parent = await this.repo.findById(input.parent_id, tenantId);
      if (!parent) throw new ValidationError('parent_id does not exist in this tenant');
    }

    return this.repo.update(id, tenantId, input);
  }

  async delete(id: string, tenantId: string, force: boolean): Promise<void> {
    const category = await this.repo.findById(id, tenantId);
    if (!category) throw new NotFoundError('Category not found');

    const associatedProducts = await this.repo.countProductsByCategory(id, tenantId);
    if (associatedProducts > 0 && !force) {
      throw new ConflictError(
        `Categoria tem ${associatedProducts} produto(s) associado(s). Use ?force=true para forçar.`,
      );
    }

    await this.repo.delete(id, tenantId);
  }
}
