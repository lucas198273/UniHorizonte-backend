import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Product,
  ProductLevel,
  ProductModality,
  ProductSort,
  ProductStatus,
} from './products.types.js';
import type { CreateProductInput, UpdateProductInput } from './products.dtos.js';
import type { Pagination } from '../../shared/pagination/pagination.js';

export interface ProductListFilters {
  pagination: Pagination;
  categoryId?: string;
  status?: ProductStatus;
  includeDrafts: boolean;
  // Filtros de curso (opcionais). `undefined` = não filtra.
  modality?: ProductModality[];
  level?: ProductLevel[];
  certification?: boolean;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  minWorkload?: number;
  maxWorkload?: number;
  sort?: ProductSort;
}

// Ordenação: sempre com desempate estável no final.
function applySort(query: ListQuery, sort: ProductSort | undefined): ListQuery {  switch (sort) {
    case 'price_asc':
      return query.order('preco', { ascending: true, nullsFirst: false });
    case 'price_desc':
      return query.order('preco', { ascending: false, nullsFirst: false });
    case 'name_asc':
      return query.order('nome', { ascending: true });
    case 'name_desc':
      return query.order('nome', { ascending: false });
    case 'oldest':
      return query.order('created_at', { ascending: true });
    case 'display_order':
      return query.order('display_order').order('nome');
    case 'newest':
      return query.order('created_at', { ascending: false });
    default:
      // Sem sort explícito: mantém o comportamento anterior (retrocompatível).
      return query.order('display_order').order('nome');
  }
}

// Só persistência. Toda query filtra por tenant_id.
export class ProductsRepository {
  constructor(private readonly db: SupabaseClient) {}

  /** Query base da listagem (tenant + count). Exposta só pra inferir o tipo do builder. */
  private buildListQuery(tenantId: string) {
    return this.db.from('products').select('*', { count: 'exact' }).eq('tenant_id', tenantId);
  }

  async findById(id: string, tenantId: string): Promise<Product | null> {
    const { data } = await this.db
      .from('products')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as Product | null) ?? null;
  }

  async findBySlug(slug: string, tenantId: string): Promise<Product | null> {
    const { data } = await this.db
      .from('products')
      .select('*')
      .eq('slug', slug)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as Product | null) ?? null;
  }

  async findBySku(sku: string, tenantId: string): Promise<Product | null> {
    const { data } = await this.db
      .from('products')
      .select('*')
      .eq('sku', sku)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return (data as Product | null) ?? null;
  }

  async list(tenantId: string, filters: ProductListFilters): Promise<{ items: Product[]; total: number }> {
    let query = this.buildListQuery(tenantId);

    if (filters.status) query = query.eq('status', filters.status);
    else if (!filters.includeDrafts) query = query.eq('status', 'active');
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);

    // Filtros de curso
    if (filters.modality?.length) query = query.in('modality', filters.modality);
    if (filters.level?.length) query = query.in('level', filters.level);
    if (filters.certification !== undefined) {
      query = query.eq('certification', filters.certification);
    }
    // overlaps = tem PELO MENOS UMA das tags (semântica natural pra filtro de UI).
    if (filters.tags?.length) query = query.overlaps('tags', filters.tags);
    if (filters.minPrice !== undefined) query = query.gte('preco', filters.minPrice);
    if (filters.maxPrice !== undefined) query = query.lte('preco', filters.maxPrice);
    if (filters.minWorkload !== undefined) {
      query = query.gte('workload_hours', filters.minWorkload);
    }
    if (filters.maxWorkload !== undefined) {
      query = query.lte('workload_hours', filters.maxWorkload);
    }

    query = applySort(query, filters.sort);

    const { data, count } = await query.range(
      filters.pagination.offset,
      filters.pagination.offset + filters.pagination.limit - 1,
    );

    return {
      items: (data as Product[] | null) ?? [],
      total: count ?? 0,
    };
  }

  async insert(
    values: CreateProductInput & { slug: string; tenant_id: string },
  ): Promise<Product> {
    const { data, error } = await this.db
      .from('products')
      .insert(values)
      .select('*')
      .single();
    if (error) throw error;
    return data as Product;
  }

  async update(id: string, tenantId: string, values: UpdateProductInput): Promise<Product> {
    const { data, error } = await this.db
      .from('products')
      .update(values)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();
    if (error) throw error;
    return data as Product;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const { error } = await this.db
      .from('products')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
  }
}
// Tipo do builder de query da listagem (inferido do select) — evita `any`.
type ListQuery = ReturnType<ProductsRepository['buildListQuery']>;