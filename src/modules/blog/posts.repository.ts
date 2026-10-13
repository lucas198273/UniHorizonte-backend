import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlogPost, PostStatus } from './posts.types.js';
import type { CreatePostInput, UpdatePostInput } from './posts.dtos.js';
import type { Pagination } from '../../shared/pagination/pagination.js';

export interface PostListFilters {
  pagination: Pagination;
  categoryId?: string;
  tag?: string;
  featured?: boolean;
  status?: PostStatus;
  publishedOnly: boolean;
}

// Só persistência. Toda query filtra por tenant_id.
export class BlogPostsRepository {
  constructor(private readonly db: SupabaseClient) { }

  async findById(id: string, tenantId: string): Promise<BlogPost | null> {
    const { data } = await this.db
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as BlogPost | null) ?? null;
  }

  async findBySlug(slug: string, tenantId: string): Promise<BlogPost | null> {
    const { data } = await this.db
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as BlogPost | null) ?? null;
  }

  async list(tenantId: string, filters: PostListFilters): Promise<{ items: BlogPost[]; total: number }> {
    let query = this.db
      .from('blog_posts')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (filters.status) query = query.eq('status', filters.status);
    else if (filters.publishedOnly) query = query.eq('status', 'published');
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.tag) query = query.contains('tags', [filters.tag]);
    if (filters.featured !== undefined) query = query.eq('featured', filters.featured);

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(filters.pagination.offset, filters.pagination.offset + filters.pagination.limit - 1);

    return { items: (data as BlogPost[] | null) ?? [], total: count ?? 0 };
  }

  async insert(
    values: CreatePostInput & {
      slug: string;
      tenant_id: string;
      published_at: string | null;
      created_by: string | null;
      tags: string[];
    },
  ): Promise<BlogPost> {
    const { data, error } = await this.db
      .from('blog_posts')
      .insert(values)
      .select('*')
      .single();
    if (error) throw error;
    return data as BlogPost;
  }

  async update(
    id: string,
    tenantId: string,
    values: UpdatePostInput & { published_at?: string | null; updated_by?: string | null; tags?: string[] },
  ): Promise<BlogPost> {
    const { data, error } = await this.db
      .from('blog_posts')
      .update(values)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (error) throw error;
    return data as BlogPost;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const { error } = await this.db
      .from('blog_posts')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
  }

  // Quantos outros posts do tenant usam a mesma URL de capa.
  // Usado antes de remover a imagem do bucket (evita apagar em uso compartilhado).
  async countByCoverUrl(url: string, excludePostId: string, tenantId: string): Promise<number> {
    const { count } = await this.db
      .from('blog_posts')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('cover_image_url', url)
      .neq('id', excludePostId);
    return count ?? 0;
  }
}
