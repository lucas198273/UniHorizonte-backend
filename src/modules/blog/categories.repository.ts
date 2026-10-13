import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlogCategory } from './categories.types.js';
import type { CreateBlogCategoryInput, UpdateBlogCategoryInput } from './categories.dtos.js';

// Só persistência. Toda query filtra por tenant_id.
export class BlogCategoriesRepository {
  constructor(private readonly db: SupabaseClient) { }

  async findById(id: string, tenantId: string): Promise<BlogCategory | null> {
    const { data } = await this.db
      .from('blog_categories')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as BlogCategory | null) ?? null;
  }

  async findBySlug(slug: string, tenantId: string): Promise<BlogCategory | null> {
    const { data } = await this.db
      .from('blog_categories')
      .select('*')
      .eq('slug', slug)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as BlogCategory | null) ?? null;
  }

  async listActive(tenantId: string): Promise<BlogCategory[]> {
    const { data } = await this.db
      .from('blog_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('display_order')
      .order('nome');
    return (data as BlogCategory[] | null) ?? [];
  }

  async listAll(tenantId: string): Promise<BlogCategory[]> {
    const { data } = await this.db
      .from('blog_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('display_order')
      .order('nome');
    return (data as BlogCategory[] | null) ?? [];
  }

  async insert(values: CreateBlogCategoryInput & { slug: string; tenant_id: string }): Promise<BlogCategory> {
    const { data, error } = await this.db
      .from('blog_categories')
      .insert(values)
      .select('*')
      .single();
    if (error) throw error;
    return data as BlogCategory;
  }

  async update(id: string, tenantId: string, values: UpdateBlogCategoryInput): Promise<BlogCategory> {
    const { data, error } = await this.db
      .from('blog_categories')
      .update(values)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (error) throw error;
    return data as BlogCategory;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const { error } = await this.db
      .from('blog_categories')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
  }

  async countPostsByCategory(categoryId: string, tenantId: string): Promise<number> {
    const { count } = await this.db
      .from('blog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId);
    return count ?? 0;
  }

  async countActivePosts(categoryId: string, tenantId: string): Promise<number> {
    const { count } = await this.db
      .from('blog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId)
      .eq('status', 'published');
    return count ?? 0;
  }

  // Contagem de posts publicados por categoria, em UMA query (evita N+1 no front).
  async countActivePostsGrouped(tenantId: string): Promise<Map<string, number>> {
    const { data } = await this.db
      .from('blog_posts')
      .select('category_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .not('category_id', 'is', null);
    const rows = (data as { category_id: string }[] | null) ?? [];
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.category_id, (map.get(r.category_id) ?? 0) + 1);
    return map;
  }
}
