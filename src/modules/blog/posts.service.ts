import { ConflictError } from '../../shared/errors/ConflictError.js';
import { NotFoundError } from '../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../shared/errors/ValidationError.js';
import { buildMeta } from '../../shared/pagination/pagination.js';
import type { parsePagination } from '../../shared/pagination/pagination.js';
import { slugify } from '../../shared/utils/slug.js';
import { sanitizeHtml } from '../../shared/utils/sanitizeHtml.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { StorageService } from '../../shared/storage/StorageService.js';
import type { SupabaseStorageRepository } from '../../shared/storage/SupabaseStorageRepository.js';
import type { BlogCategoriesRepository } from './categories.repository.js';
import type { BlogPostProductsRepository } from './postProducts.repository.js';
import type { CreatePostInput, PaginatedPosts, UpdatePostInput } from './posts.dtos.js';
import type { BlogPostsRepository } from './posts.repository.js';
import type { BlogPost, PostStatus } from './posts.types.js';

interface ListOptions {
  pagination: ReturnType<typeof parsePagination>;
  categoryId?: string;
  tag?: string;
  featured?: boolean;
  status?: PostStatus;
  publishedOnly: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Sentinela interna para "slug de categoria não existe no tenant".
const CATEGORY_NOT_FOUND = Symbol('CATEGORY_NOT_FOUND');

// Normaliza tags: trim, minúsculas, sem vazios/duplicatas.
function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t !== ''))];
}

export class BlogPostsService {
  constructor(
    private readonly repo: BlogPostsRepository,
    private readonly categoriesRepo: BlogCategoriesRepository,
    private readonly linksRepo: BlogPostProductsRepository,
    private readonly storage: StorageService,
    private readonly storageRepo: SupabaseStorageRepository,
  ) { }

  /**
   * Limpeza best-effort da capa antiga do bucket. NUNCA propaga erro
   * nem reverte a operação no banco.
   * Regras: só URLs do próprio bucket; só apaga se nenhuma outra linha
   * do tenant usar a mesma URL.
   */
  private async cleanupCoverImage(
    url: string | null | undefined,
    excludePostId: string,
    tenantId: string,
  ): Promise<void> {
    if (!url) return;
    try {
      const bucket = env.blogStorageBucket;
      const path = this.storageRepo.extractPathFromPublicUrl(url, bucket);
      if (!path) return; // URL externa ou de outro bucket: não mexe

      const sharedCount = await this.repo.countByCoverUrl(url, excludePostId, tenantId);
      if (sharedCount > 0) return; // ainda usada por outro post

      await this.storage.deleteImage(bucket, tenantId, path);
      logger.info('Cover image removed from storage', { path });
    } catch (err) {
      logger.warn('Failed to remove old cover image from storage', {
        url,
        error: String(err),
      });
    }
  }

  // Aceita UUID de categoria OU slug. Slug inexistente => filtro sem match (lista vazia).
// Retorna sempre um categoryId definitivo, ou null (sem categoria).
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

async list(tenantId: string, options: ListOptions): Promise<PaginatedPosts> {
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
    tag: options.tag,
    featured: options.featured,
    status: options.status,
    publishedOnly: options.publishedOnly,
  });
  return {
    items,
    meta: buildMeta(total, options.pagination.page, options.pagination.limit),
  };
}

  async getById(id: string, tenantId: string, publicOnly: boolean): Promise<BlogPost> {
    const post = await this.repo.findById(id, tenantId);
    if (!post || (publicOnly && post.status !== 'published')) {
      throw new NotFoundError('Post not found');
    }
    return post;
  }

  async getBySlug(slug: string, tenantId: string, publicOnly: boolean): Promise<BlogPost> {
    const post = await this.repo.findBySlug(slug, tenantId);
    if (!post || (publicOnly && post.status !== 'published')) {
      throw new NotFoundError('Post not found');
    }
    return post;
  }

  async create(
    tenantId: string,
    userId: string | null,
    input: CreatePostInput,
  ): Promise<BlogPost> {
    const slug = input.slug ?? slugify(input.title);
    if (!slug) throw new ValidationError('Could not generate a valid slug');

    if (await this.repo.findBySlug(slug, tenantId)) {
      throw new ConflictError(`Slug "${slug}" already exists in this tenant`);
    }
    if (input.category_id) {
      await this.assertCategoryInTenant(input.category_id, tenantId);
    }

    const status: PostStatus = input.status ?? 'draft';
    return this.repo.insert({
      ...input,
      content: sanitizeHtml(input.content),
      slug,
      tenant_id: tenantId,
      status,
      tags: normalizeTags(input.tags),
      published_at: status === 'published' ? new Date().toISOString() : null,
      created_by: userId,
    });
  }

  async update(
    id: string,
    tenantId: string,
    userId: string | null,
    input: UpdatePostInput,
  ): Promise<BlogPost> {
    const current = await this.repo.findById(id, tenantId);
    if (!current) throw new NotFoundError('Post not found');

    if (input.slug && input.slug !== current.slug) {
      if (await this.repo.findBySlug(input.slug, tenantId)) {
        throw new ConflictError(`Slug "${input.slug}" already exists in this tenant`);
      }
    }
    if (input.category_id) {
      await this.assertCategoryInTenant(input.category_id, tenantId);
    }

    // Regras de publicação:
    // - draft -> published: published_at = now (se ainda não tiver)
    // - published -> draft / archived: manter published_at (histórico)
    let published_at = current.published_at;
    if (input.status && input.status !== current.status) {
      if (input.status === 'published' && !published_at) {
        published_at = new Date().toISOString();
      }
    }

    const updated = await this.repo.update(id, tenantId, {
      ...input,
      content: input.content !== undefined ? sanitizeHtml(input.content) : undefined,
      tags: input.tags !== undefined ? normalizeTags(input.tags) : undefined,
      published_at,
      updated_by: userId,
    });

    // Depois de persistir: se a capa mudou, limpa a antiga (best-effort).
    const oldCover = current.cover_image_url;
    if (input.cover_image_url !== undefined && oldCover && oldCover !== input.cover_image_url) {
      await this.cleanupCoverImage(oldCover, id, tenantId);
    }
    return updated;
  }

  async delete(id: string, tenantId: string, force: boolean): Promise<void> {
    const post = await this.repo.findById(id, tenantId);
    if (!post) throw new NotFoundError('Post not found');

    const linkedProducts = await this.linksRepo.countByPost(id);
    if (linkedProducts > 0 && !force) {
      throw new ConflictError(
        `Post tem ${linkedProducts} produto(s) associado(s). Use ?force=true para forçar.`,
      );
    }

    // Antes de deletar a linha: limpa a capa (best-effort, nunca quebra).
    await this.cleanupCoverImage(post.cover_image_url, id, tenantId);
    await this.repo.delete(id, tenantId);
  }

  private async assertCategoryInTenant(categoryId: string, tenantId: string): Promise<void> {
    const category = await this.categoriesRepo.findById(categoryId, tenantId);
    if (!category) throw new ValidationError('category_id does not exist in this tenant');
  }
}
