export interface ProductCategory {
  id: string;
  tenant_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  parent_id: string | null;
  display_order: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

// Categoria com contagem de produtos ativos (listagem pública).
// Retrocompatível: estende ProductCategory, só adiciona product_count.
export interface ProductCategoryWithCount extends ProductCategory {
  product_count: number;
}
