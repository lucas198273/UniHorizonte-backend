import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductCategory } from './productCategories.types.js';
import type {
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
} from './productCategories.dtos.js';

// Só persistência. Toda query filtra por tenant_id.
export class ProductCategoriesRepository {
  constructor(private readonly db: SupabaseClient) { }

  async findById(id: string, tenantId: string): Promise<ProductCategory | null> {
    const { data } = await this.db
      .from('product_categories')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as ProductCategory | null) ?? null;
  }

  async findBySlug(slug: string, tenantId: string): Promise<ProductCategory | null> {
    const { data } = await this.db
      .from('product_categories')
      .select('*')
      .eq('slug', slug)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as ProductCategory | null) ?? null;
  }

  async listActive(tenantId: string): Promise<ProductCategory[]> {
    const { data } = await this.db
      .from('product_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('display_order')
      .order('nome');
    return (data as ProductCategory[] | null) ?? [];
  }

  async insert(
    values: CreateProductCategoryInput & { slug: string; tenant_id: string },
  ): Promise<ProductCategory> {
    const { data, error } = await this.db
      .from('product_categories')
      .insert(values)
      .select('*')
      .single();
    if (error) throw error;
    return data as ProductCategory;
  }

  async update(
    id: string,
    tenantId: string,
    values: UpdateProductCategoryInput,
  ): Promise<ProductCategory> {
    const { data, error } = await this.db
      .from('product_categories')
      .update(values)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (error) throw error;
    return data as ProductCategory;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const { error } = await this.db
      .from('product_categories')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
  }

  async countProductsByCategory(categoryId: string, tenantId: string): Promise<number> {
    const { count } = await this.db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId);
    return count ?? 0;
  }

  async countActiveProducts(categoryId: string, tenantId: string): Promise<number> {
    const { count } = await this.db
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
      .eq('tenant_id', tenantId)
      .eq('status', 'active');
    return count ?? 0;
  }

  // Contagem de produtos ativos por categoria, em UMA query (evita N+1 no front).
  async countActiveProductsGrouped(tenantId: string): Promise<Map<string, number>> {
    const { data } = await this.db
      .from('products')
      .select('category_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .not('category_id', 'is', null);
    const rows = (data as { category_id: string }[] | null) ?? [];
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.category_id, (map.get(r.category_id) ?? 0) + 1);
    return map;
  }
}
