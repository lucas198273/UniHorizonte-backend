import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product } from '../products/products.types.js';

export interface PostProductLink {
  post_id: string;
  product_id: string;
  display_order: number;
}

// Associação N:N post↔product. Filtra por tenant via post/produto.
export class BlogPostProductsRepository {
  constructor(private readonly db: SupabaseClient) { }

  async listByPost(postId: string, tenantId: string, includeInactive: boolean): Promise<Product[]> {
    let query = this.db
      .from('blog_post_products')
      .select('display_order, products!inner(*)')
      .eq('post_id', postId)
      .eq('products.tenant_id', tenantId)
      .order('display_order');
    if (!includeInactive) query = query.eq('products.status', 'active');
    const { data } = await query;
    const rows = (data as { products: Product }[] | null) ?? [];
    // Guard defensivo: `images` pode vir como string vazia (coluna text),
    // null ou objeto inesperado. Normaliza para array válido de imagens.
    return rows.map((r) => {
      const product = r.products;
      if (product && !Array.isArray(product.images)) {
        return { ...product, images: [] };
      }
      return product;
    });
  }

  async associate(
    postId: string,
    tenantId: string,
    productIds: string[],
  ): Promise<void> {
    const { error } = await this.db.from('blog_post_products').upsert(
      productIds.map((productId) => ({ post_id: postId, product_id: productId })),
    );
    if (error) throw error;
    void tenantId; // tenant validado no service antes de chamar
  }

  async dissociate(postId: string, productId: string): Promise<void> {
    const { error } = await this.db
      .from('blog_post_products')
      .delete()
      .eq('post_id', postId)
      .eq('product_id', productId);
    if (error) throw error;
  }

  async countByPost(postId: string): Promise<number> {
    const { count } = await this.db
      .from('blog_post_products')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);
    return count ?? 0;
  }

  async countByProduct(productId: string): Promise<number> {
    const { count } = await this.db
      .from('blog_post_products')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId);
    return count ?? 0;
  }
}
