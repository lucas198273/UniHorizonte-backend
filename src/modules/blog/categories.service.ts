import { ConflictError } from '../../shared/errors/ConflictError.js';
import { NotFoundError } from '../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../shared/errors/ValidationError.js';
import { slugify } from '../../shared/utils/slug.js';
import type { BlogCategoriesRepository } from './categories.repository.js';
import type { CreateBlogCategoryInput, UpdateBlogCategoryInput } from './categories.dtos.js';
import type { BlogCategory, BlogCategoryWithCount } from './categories.types.js';

export class BlogCategoriesService {
  constructor(private readonly repo: BlogCategoriesRepository) { }

  async list(tenantId: string, includeArchived: boolean): Promise<BlogCategory[]> {
    return includeArchived ? this.repo.listAll(tenantId) : this.repo.listActive(tenantId);
  }

  // Listagem com contagem de posts publicados por categoria.
  // Uma única query extra (contagem agrupada), sem N+1.
  async listWithPostCount(
    tenantId: string,
    includeArchived: boolean,
  ): Promise<BlogCategoryWithCount[]> {
    const [items, counts] = await Promise.all([
      includeArchived ? this.repo.listAll(tenantId) : this.repo.listActive(tenantId),
      this.repo.countActivePostsGrouped(tenantId),
    ]);
    return items.map((c) => ({ ...c, post_count: counts.get(c.id) ?? 0 }));
  }

  async getBySlugOrId(slugOrId: string, tenantId: string): Promise<BlogCategory> {
    const byId = await this.repo.findById(slugOrId, tenantId);
    const category = byId ?? (await this.repo.findBySlug(slugOrId, tenantId));
    if (!category) throw new NotFoundError('Category not found');
    return category;
  }

  async create(tenantId: string, input: CreateBlogCategoryInput): Promise<BlogCategory> {
    const slug = input.slug ?? slugify(input.nome);
    if (!slug) throw new ValidationError('Could not generate a valid slug');

    if (await this.repo.findBySlug(slug, tenantId)) {
      throw new ConflictError(`Slug "${slug}" already exists in this tenant`);
    }
    if (input.parent_id) {
      await this.assertSameTenantParent(input.parent_id, tenantId);
    }

    return this.repo.insert({ ...input, slug, tenant_id: tenantId });
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateBlogCategoryInput,
  ): Promise<BlogCategory> {
    const current = await this.repo.findById(id, tenantId);
    if (!current) throw new NotFoundError('Category not found');

    if (input.slug && input.slug !== current.slug) {
      if (await this.repo.findBySlug(input.slug, tenantId)) {
        throw new ConflictError(`Slug "${input.slug}" already exists in this tenant`);
      }
    }
    if (input.parent_id) {
      if (input.parent_id === id) throw new ValidationError('A category cannot be its own parent');
      await this.assertSameTenantParent(input.parent_id, tenantId);
    }

    return this.repo.update(id, tenantId, input);
  }

  async delete(id: string, tenantId: string, force: boolean): Promise<void> {
    const category = await this.repo.findById(id, tenantId);
    if (!category) throw new NotFoundError('Category not found');

    const associatedPosts = await this.repo.countPostsByCategory(id, tenantId);
    if (associatedPosts > 0 && !force) {
      throw new ConflictError(
        `Categoria tem ${associatedPosts} post(s) associado(s). Use ?force=true para forçar.`,
      );
    }

    await this.repo.delete(id, tenantId);
  }

  private async assertSameTenantParent(parentId: string, tenantId: string): Promise<void> {
    const parent = await this.repo.findById(parentId, tenantId);
    if (!parent) throw new ValidationError('parent_id does not exist in this tenant');
  }
}
